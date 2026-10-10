import pytest
from main import assess


def test_peak_at_limit_passes():
    peak, frequency, status = assess([
        (10, 5),
        (30, 15),
        (60, 25),
    ])

    assert peak == 15
    assert frequency == 30
    assert status == "PASS"


def test_peak_above_limit_fails():
    peak, frequency, status = assess([
        (20, 12),
        (40, 18),
    ])

    assert peak == 18
    assert frequency == 40
    assert status == "FAIL"


def test_frequency_at_50_is_included():
    peak, frequency, status = assess([
        (40, 10),
        (50, 16),
        (60, 25),
    ])

    assert peak == 16
    assert frequency == 50
    assert status == "FAIL"


def test_frequency_above_50_is_ignored():
    peak, frequency, status = assess([
        (20, 12),
        (50, 14),
        (60, 30),
    ])

    assert peak == 14
    assert frequency == 50
    assert status == "PASS"


def test_empty_assessment_range_is_rejected():
    with pytest.raises(ValueError):
        assess([(60, 20), (80, 30)])
