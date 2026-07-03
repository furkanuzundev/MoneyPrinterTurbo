from worker.monitor import should_alert


def test_alerts_after_consecutive_strikes():
    assert should_alert([6, 7, 8], threshold=5, strikes=3) is True


def test_no_alert_below_threshold():
    assert should_alert([6, 3, 8], threshold=5, strikes=3) is False


def test_no_alert_with_short_history():
    assert should_alert([9, 9], threshold=5, strikes=3) is False


def test_threshold_is_exclusive():
    assert should_alert([5, 5, 5], threshold=5, strikes=3) is False
