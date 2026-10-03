import io
import json
import unittest
from unittest.mock import Mock, patch

import export_workout
from export_workout import read_operations, run


class NotFound(Exception):
    pass


NotFound.__name__ = 'GarminConnectNotFoundError'


class HttpError(Exception):
    def __init__(self, status):
        super().__init__(f'HTTP {status}')
        self.response = Mock(status_code=status, headers={})


def upsert(key='1', **extra):
    return {'key': key, 'action': 'upsert', 'workout': {'workoutName': 'x'}, 'date': '2026-10-04', **extra}


class ExportWorkoutTests(unittest.TestCase):
    def client(self):
        client = Mock()
        client.upload_workout.return_value = {'workoutId': 11}
        client.schedule_workout.return_value = {'workoutScheduleId': 22}
        return client

    def safety(self):
        return Mock(stopped=None)

    def test_creates_and_schedules_a_new_workout(self):
        client = self.client()
        results, stopped = run(client, self.safety(), [upsert()])
        self.assertIsNone(stopped)
        self.assertEqual(results, [{'key': '1', 'ok': True, 'workoutId': '11', 'scheduleId': '22'}])
        client.schedule_workout.assert_called_once_with('11', '2026-10-04')
        client.update_workout.assert_not_called()

    def test_updates_in_place_and_keeps_the_schedule_on_the_same_day(self):
        client = self.client()
        results, _ = run(client, self.safety(), [upsert(workoutId='5', scheduleId='6', previousDate='2026-10-04')])
        self.assertEqual(results[0], {'key': '1', 'ok': True, 'workoutId': '5', 'scheduleId': '6'})
        client.update_workout.assert_called_once_with('5', {'workoutName': 'x'})
        client.upload_workout.assert_not_called()
        client.schedule_workout.assert_not_called()

    def test_moves_the_schedule_when_the_date_changed(self):
        client = self.client()
        results, _ = run(client, self.safety(), [upsert(workoutId='5', scheduleId='6', previousDate='2026-10-02')])
        client.unschedule_workout.assert_called_once_with('6')
        client.schedule_workout.assert_called_once_with('5', '2026-10-04')
        self.assertEqual(results[0]['scheduleId'], '22')

    def test_recreates_a_workout_deleted_in_garmin(self):
        client = self.client()
        client.update_workout.side_effect = NotFound()
        client.unschedule_workout.side_effect = NotFound()
        results, _ = run(client, self.safety(), [upsert(workoutId='5', scheduleId='6', previousDate='2026-10-04')])
        self.assertEqual(results[0], {'key': '1', 'ok': True, 'workoutId': '11', 'scheduleId': '22'})

    def test_delete_ignores_items_already_missing(self):
        client = self.client()
        client.unschedule_workout.side_effect = NotFound()
        results, _ = run(client, self.safety(), [{'key': '1', 'action': 'delete', 'workoutId': '5', 'scheduleId': '6'}])
        self.assertEqual(results, [{'key': '1', 'ok': True}])
        client.delete_workout.assert_called_once_with('5')

    def test_a_rejected_workout_does_not_stop_the_batch(self):
        client = self.client()
        client.upload_workout.side_effect = [HttpError(400), {'workoutId': 12}]
        safety = self.safety()
        safety.stopped = object()
        results, stopped = run(client, safety, [upsert('1'), upsert('2')])
        self.assertIsNone(stopped)
        self.assertEqual(results[0], {'key': '1', 'ok': False, 'code': 'Rejected'})
        self.assertTrue(results[1]['ok'])
        self.assertIsNone(safety.stopped)

    def test_throttling_stops_the_remaining_operations(self):
        client = self.client()
        client.upload_workout.side_effect = HttpError(429)
        safety = self.safety()
        results, stopped = run(client, safety, [upsert('1'), upsert('2')])
        self.assertIsNotNone(stopped)
        safety.fail.assert_called_once()
        self.assertEqual([r['code'] for r in results], ['ProviderError', 'NotAttempted'])
        self.assertEqual(client.upload_workout.call_count, 1)

    def test_rejects_malformed_input(self):
        for payload in ({}, {'operations': []}, {'operations': [upsert(date='04/10/2026')]},
                        {'operations': [upsert(workoutId='1;2')]},
                        {'operations': [{'key': '1', 'action': 'drop'}]},
                        {'operations': [upsert(str(i)) for i in range(15)]}):
            with patch('sys.stdin', io.StringIO(json.dumps(payload) + '\n')):
                with self.assertRaisesRegex(ValueError, 'InvalidInput'):
                    read_operations()

    def test_account_mismatch_writes_nothing(self):
        client = self.client()
        client.get_rhr_day.return_value = {'userProfileId': 999}
        with patch.object(export_workout, 'manual_client', return_value=client), \
                patch.object(export_workout, 'operation_lock'), \
                patch.object(export_workout, 'RequestSafety'), \
                patch.object(export_workout.Path, 'read_text',
                             return_value=json.dumps({'garminUserProfileId': '123', 'timezone': 'Europe/Madrid'})), \
                patch('sys.stdin', io.StringIO(json.dumps({'operations': [upsert()]}) + '\n')), \
                patch('builtins.print') as output:
            export_workout.main()
        self.assertEqual(json.loads(output.call_args[0][0]), {'ok': False, 'code': 'AuthenticationFailed'})
        client.upload_workout.assert_not_called()


if __name__ == '__main__':
    unittest.main()
