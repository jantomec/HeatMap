def slowish_sum(limit: int) -> int:
    total = 0
    for value in range(limit):
        total += value * 2
    return total


def call_twice(limit: int) -> int:
    first = slowish_sum(limit)
    second = slowish_sum(max(1, limit // 2))
    return first + second
