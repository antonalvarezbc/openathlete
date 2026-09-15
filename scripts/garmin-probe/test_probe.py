import unittest
from datetime import date
from unittest.mock import Mock
from probe import collect, dates_ending, error_record


class ProbeTests(unittest.TestCase):
    def test_dates_cross_month_and_leap_day(self):
        days = dates_ending(date(2024, 3, 2))
        self.assertEqual(len(days), 7)
        self.assertEqual(days[0], '2024-02-25')
        self.assertIn('2024-02-29', days)

    def test_read_only_budget_and_missing_data(self):
        client = Mock(spec=['get_activities', 'get_sleep_data', 'get_hrv_data', 'get_rhr_day'])
        client.get_activities.return_value = []
        client.get_sleep_data.return_value = {'sleepTimeSeconds': 0}
        client.get_hrv_data.return_value = None
        client.get_rhr_day.return_value = {}
        checks = collect(client, date(2024, 3, 2))
        self.assertEqual(len(checks), 22)
        client.get_activities.assert_called_once_with(0, 3)
        self.assertEqual(client.get_sleep_data.call_count, 7)
        self.assertEqual(checks['2024-03-02/hrv']['status'], 'empty')
        self.assertEqual(checks['2024-03-02/sleep']['status'], 'received')

    def test_rate_limit_stops_and_redacts(self):
        client = Mock()
        exc = RuntimeError('secret password and payload')
        exc.response = Mock(status_code=429)
        client.get_activities.side_effect = exc
        checks = collect(client, date(2024, 3, 2))
        self.assertEqual(len(checks), 1)
        client.get_sleep_data.assert_not_called()
        self.assertNotIn('secret', str(checks))

    def test_individual_failure_keeps_other_days(self):
        client = Mock()
        client.get_sleep_data.side_effect = ValueError('private response')
        self.assertEqual(len(collect(client, date(2024, 3, 2))), 22)
        self.assertEqual(error_record(ValueError('private'))['error_type'], 'ValueError')


if __name__ == '__main__':
    unittest.main()
