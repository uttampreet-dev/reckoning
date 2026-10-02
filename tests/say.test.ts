// Numbers that are read aloud are written out first, in the Indian grouping.
import { describe, expect, it } from "vitest";
import { say } from "../src/lib/say";

describe("numbers spoken in English", () => {
  it.each([
    [0, "zero"],
    [7, "seven"],
    [19, "nineteen"],
    [31, "thirty-one"],
    [100, "one hundred"],
    [343, "three hundred and forty-three"],
    [8435, "eight thousand four hundred and thirty-five"],
    [19800, "nineteen thousand eight hundred"],
    [50000, "fifty thousand"],
    [123456, "one lakh twenty-three thousand four hundred and fifty-six"],
    [20252023, "two crore two lakh fifty-two thousand and twenty-three"],
    [-12415, "minus twelve thousand four hundred and fifteen"],
  ])("%d", (n, words) => expect(say(n, "en")).toBe(words));
});

describe("numbers spoken in Hindi", () => {
  it.each([
    [0, "शून्य"],
    [9, "नौ"],
    [31, "इकतीस"],
    [59, "उनसठ"],
    [99, "निन्यानवे"],
    [100, "एक सौ"],
    [8435, "आठ हज़ार चार सौ पैंतीस"],
    [19800, "उन्नीस हज़ार आठ सौ"],
    [50000, "पचास हज़ार"],
    [123456, "एक लाख तेईस हज़ार चार सौ छप्पन"],
  ])("%d", (n, words) => expect(say(n, "hi")).toBe(words));

  it("has a distinct word for every number below a hundred", () => {
    expect(new Set(Array.from({ length: 100 }, (_, i) => say(i, "hi"))).size).toBe(100);
  });
});
