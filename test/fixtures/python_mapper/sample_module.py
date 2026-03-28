def plain_function(value):
    total = value + 1
    return total


def decorator(function):
    return function


@decorator
def decorated_function(value):
    return value * 2


class Example:
    def method(self, value):
        return plain_function(value)


def outer():
    def inner():
        return 42

    return inner()


async def async_worker():
    return 7
