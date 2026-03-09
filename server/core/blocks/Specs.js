/**
 * Specs Block - v24 Standardized
 * Standardized physical DNA (thickness, dimensions, area).
 */
export class Specs {
  constructor(raw = {}) {
    this.sheetThickness = Number(raw.sheetThickness) || 0;
    this.foilThickness = Number(raw.foilThickness) || 0;
    this.width = Number(raw.width) || 0;
    this.length = Number(raw.length) || 0;
    this.area = Number(raw.area) || (this.width * this.length / 1000000) || 0;
  }

  toJSON() {
    return {
      sheetThickness: this.sheetThickness,
      foilThickness: this.foilThickness,
      width: this.width,
      length: this.length,
      area: this.area
    };
  }
}
