import unittest
from datetime import date, timedelta
from unittest.mock import Mock, call
from sync import collect_sync


class SyncTests(unittest.TestCase):
    def client(self):
        client = Mock()
        client.get_rhr_day.side_effect = lambda day: {'userProfileId': 123, 'allMetrics': {'metricsMap': {'WELLNESS_RESTING_HEART_RATE': [{'calendarDate': day, 'value': 55}]}}}
        client.get_stats.side_effect = lambda day: {'calendarDate': day, 'restingHeartRate': 55}
        client.get_body_composition.return_value = {}
        client.get_fitnessage_data.return_value = {}
        client.get_max_metrics_range.return_value = []
        client.get_blood_pressure.return_value = {}
        client.get_activities.return_value = [{'activityId': 456, 'ownerId': 123, 'startTimeGMT': '2026-09-15 08:00:00', 'duration': 120.5, 'movingDuration': 100, 'distance': 1000, 'activityType': {'typeKey': 'trail_running'}}]
        client.get_hrv_data.side_effect = lambda day: {'hrvSummary': {'calendarDate': day, 'lastNightAvg': None if day == '2026-09-13' else 43}}
        client.get_sleep_data.side_effect = lambda day: {'dailySleepDTO': {'calendarDate': day, 'sleepTimeSeconds': 28800, 'awakeSleepSeconds': 0}}
        return client

    def test_units_dates_and_missing_values(self):
        client = self.client()
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(result['activities'][0]['startDate'], '2026-09-15T08:00:00+00:00')
        self.assertEqual(result['activities'][0]['sport'], 'TRAIL_RUNNING')
        self.assertEqual(result['activities'][0]['movingTime'], 100)
        self.assertIn({'date': '2026-09-15', 'type': 'SLEEP_DURATION', 'value': 8}, result['metrics'])
        self.assertIn({'date': '2026-09-15', 'type': 'SLEEP_AWAKE_DURATION', 'value': 0}, result['metrics'])
        self.assertFalse(any(m['type'] == 'HRV_LAST_NIGHT_AVG' and m['date'] == '2026-09-13' for m in result['metrics']))
        self.assertEqual(client.get_rhr_day.call_count, 1)
        self.assertEqual(client.get_stats.call_count, 7)
        self.assertEqual(client.get_hrv_data.call_count, 7)
        client.get_activities.assert_called_once_with(0, 100)

    def test_account_mismatch_stops_before_activities(self):
        client = self.client()
        with self.assertRaisesRegex(ValueError, 'AccountMismatch'):
            collect_sync(client, {'garminUserProfileId': '999'}, date(2026, 9, 15))
        client.get_activities.assert_not_called()


    def test_activity_summary_preserves_supported_measurements_without_extra_requests(self):
        client = self.client()
        client.get_activities.return_value[0].update({
            'description': '  Easy trail run\nSteady effort.  ',
            'averageRunningCadenceInStepsPerMinute': 168.5,
            'avgPower': 205.5,
            'maxPower': 410,
            'normPower': 230,
            'calories': 300,
            'bmrCalories': 20,
        })
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        activity = result['activities'][0]
        self.assertEqual(activity['description'], 'Easy trail run\nSteady effort.')
        self.assertEqual(activity['averageCadence'], 168.5)
        self.assertEqual(activity['averageWatts'], 205.5)
        self.assertEqual(activity['maxWatts'], 410)
        self.assertEqual(activity['weightedAverageWatts'], 230)
        self.assertNotIn('kilojoules', activity)
        self.assertEqual(len(client.mock_calls), 27)
        client.get_activities.assert_called_once_with(0, 100)

    def test_optional_activity_measurements_do_not_invent_missing_values(self):
        fields = {
            'averageRunningCadenceInStepsPerMinute': 'averageCadence',
            'avgPower': 'averageWatts',
            'maxPower': 'maxWatts',
            'normPower': 'weightedAverageWatts',
        }
        for value in [None, True, '120', -1, float('nan'), float('inf')]:
            with self.subTest(value=value):
                client = self.client()
                client.get_activities.return_value[0].update({key: value for key in fields})
                result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
                for destination in fields.values():
                    self.assertIsNone(result['activities'][0][destination])
        client = self.client()
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        for destination in fields.values():
            self.assertIsNone(result['activities'][0][destination])
        self.assertIsNone(result['activities'][0]['description'])

    def test_zero_activity_measurements_are_preserved_and_description_requires_text(self):
        for description in [None, 123, {}, ' \n ']:
            with self.subTest(description=description):
                client = self.client()
                client.get_activities.return_value[0].update({
                    'description': description,
                    'averageRunningCadenceInStepsPerMinute': 0,
                    'avgPower': 0,
                    'maxPower': 0,
                    'normPower': 0,
                })
                result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
                activity = result['activities'][0]
                self.assertIsNone(activity['description'])
                for field in ['averageCadence', 'averageWatts', 'maxWatts', 'weightedAverageWatts']:
                    self.assertEqual(activity[field], 0)

    def test_includes_full_42_day_boundary_and_today_but_not_older_activities(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        today = date(2026, 9, 15)
        client.get_activities.return_value = [
            {**template, 'activityId': offset, 'startTimeGMT': (today - timedelta(days=offset)).isoformat() + ' 00:00:00'}
            for offset in [0, 31, 41, 42, 43]
        ]
        result = collect_sync(client, {'garminUserProfileId': '123'}, today)
        self.assertEqual([a['id'] for a in result['activities']], ['0', '31', '41', '42'])
        client.get_activities.assert_called_once_with(0, 100)
        self.assertEqual(client.get_stats.call_count, 7)

    def test_paginates_only_until_history_is_covered(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.side_effect = [
            [{**template, 'activityId': i} for i in range(100)],
            [{**template, 'activityId': 100, 'startTimeGMT': '2026-08-04 08:00:00'},
             {**template, 'activityId': 101, 'startTimeGMT': '2026-08-03 08:00:00'}],
        ]
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(len(result['activities']), 101)
        self.assertEqual(client.get_activities.call_args_list, [call(0, 100), call(100, 100)])
        self.assertNotIn('ActivityHistoryIncomplete', result['warnings'])

    def test_full_page_with_older_activity_does_not_request_next_page(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.return_value = [
            {**template, 'activityId': i, 'startTimeGMT': '2026-08-03 08:00:00'} for i in range(100)]
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(result['activities'], [])
        client.get_activities.assert_called_once_with(0, 100)

    def test_page_limit_reports_incomplete_history(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.side_effect = lambda start, limit: [
            {**template, 'activityId': i} for i in range(start, start + limit)]
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(len(result['activities']), 500)
        self.assertEqual(client.get_activities.call_count, 5)
        self.assertIn('ActivityHistoryIncomplete', result['warnings'])

    def test_repeated_page_stops_and_deduplicates(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.return_value = [{**template, 'activityId': i} for i in range(100)]
        result = collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(len(result['activities']), 100)
        self.assertEqual(client.get_activities.call_count, 2)
        self.assertIn('ActivityHistoryIncomplete', result['warnings'])

    def test_next_page_failure_stops_without_retry_or_wellness_requests(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.side_effect = [
            [{**template, 'activityId': i} for i in range(100)], RuntimeError('429')]
        with self.assertRaises(RuntimeError):
            collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(client.get_activities.call_count, 2)
        client.get_stats.assert_not_called()

    def test_next_page_identity_mismatch_rejects_entire_result(self):
        client = self.client()
        template = client.get_activities.return_value[0]
        client.get_activities.side_effect = [
            [{**template, 'activityId': i} for i in range(100)], [{**template, 'ownerId': 999}]]
        with self.assertRaisesRegex(ValueError, 'AccountMismatch'):
            collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        client.get_stats.assert_not_called()

    def test_error_stops_without_retry(self):
        client = self.client()
        client.get_hrv_data.side_effect = RuntimeError('rate limited')
        with self.assertRaises(RuntimeError):
            collect_sync(client, {'garminUserProfileId': '123'}, date(2026, 9, 15))
        self.assertEqual(client.get_hrv_data.call_count, 1)
        client.get_sleep_data.assert_not_called()



class HealthMappingTests(unittest.TestCase):
    def test_daily_units_and_no_physiological_inference(self):
        from health_metrics import DAILY_FIELDS, map_fields
        rows = []
        map_fields(rows, '2026-09-15', {'maxHeartRate': 151, 'stressDuration': 3600,
            'totalDistanceMeters': 12500, 'averageStressLevel': -1, 'bodyBatteryDrainedValue': 0}, DAILY_FIELDS)
        values = {r['type']: r['value'] for r in rows}
        self.assertEqual(values['HR_MAX_DAILY'], 151)
        self.assertEqual(values['STRESS_DURATION'], 60)
        self.assertEqual(values['DAILY_DISTANCE'], 12.5)
        self.assertEqual(values['BODY_BATTERY_DRAINED'], 0)
        self.assertNotIn('HR_MAX', values)
        self.assertNotIn('STRESS_AVERAGE', values)

    def test_weight_requires_measurement_date_and_converts_grams(self):
        from health_metrics import map_body
        rows = []
        map_body(rows, {'totalAverage': {'weight': 70000}, 'dateWeightList': [
            {'calendarDate': '2026-09-14', 'weight': 60100, 'muscleMass': 42000},
            {'calendarDate': '2026-08-01', 'weight': 64000}]}, '2026-09-09', '2026-09-15')
        self.assertEqual(rows, [{'date': '2026-09-14', 'type': 'WEIGHT', 'value': 60.1},
                                {'date': '2026-09-14', 'type': 'MUSCLE_MASS', 'value': 42}])

    def test_vo2_and_pressure_preserve_dates(self):
        from health_metrics import map_vo2, map_blood_pressure
        rows = []
        map_vo2(rows, [{'generic': {'calendarDate': '2026-09-12', 'vo2MaxPreciseValue': 49.2}}], '2026-09-09', '2026-09-15')
        self.assertEqual(rows[0]['date'], '2026-09-12')
        self.assertEqual(rows[0]['value'], 49.2)
        map_blood_pressure(rows, {'measurementSummaries': [{'measurements': [
            {'measurementTimestampLocal': '2026-09-13T08:00:00', 'systolic': 120, 'diastolic': 80}]}]}, '2026-09-09', '2026-09-15')
        self.assertEqual(rows[-1], {'date': '2026-09-13', 'type': 'BLOOD_PRESSURE_DIASTOLIC', 'value': 80})

    def test_missing_optional_endpoint_warns_but_rate_limit_stops(self):
        from health_metrics import optional_read
        result = {'warnings': []}
        class Missing(Exception):
            response = Mock(status_code=404)
        self.assertIsNone(optional_read(result, 'body', Mock(side_effect=Missing())))
        self.assertEqual(result['warnings'], ['Unavailable:body'])
        class Limited(Exception):
            response = Mock(status_code=429)
        with self.assertRaises(Limited):
            optional_read(result, 'body', Mock(side_effect=Limited()))


if __name__ == "__main__":
    unittest.main()
