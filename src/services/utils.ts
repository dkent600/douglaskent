export const evaluateDateTime = (valueA: string, valueB: string, factor = 1) => {
  // let a = this.moment.utc(valueA);
  // let b = this.moment.utc(valueB);

  valueA = valueA.replace(" (intermittent)", "");
  valueB = valueB.replace(" (intermittent)", "");

  if (valueA.startsWith("present")) {
    valueA = new Date().toDateString();
  }

  if (valueB.startsWith("present")) {
    valueB = new Date().toDateString();
  }

  const a = new Date(valueA).valueOf();
  const b = new Date(valueB).valueOf();

  if (!a && !b) return 0;

  if (!a) return -factor;
  if (!b) return factor;

  return (a - b) * factor;
};

// private evaluateString(a: string, b: string, factor: number) {
//     if (!a && !b) return 0;

//     if (!a) return -factor;
//     if (!b) return factor;

//     a = a.toLowerCase();
//     b = b.toLowerCase();

//     return a.localeCompare(b) * factor;
// }
