from app import call_twice


def test_call_twice() -> None:
    assert call_twice(300) > 0
