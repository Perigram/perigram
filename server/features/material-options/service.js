import * as repository from './repository.js';

export async function list() {
  return await repository.find();
}

export async function getByMaterial(material) {
  return await repository.findOne({ material });
}

export async function seed() {
  const defaults = [
    {
      material: 'Aluminium Composite',
      foilThicknessOptions: [0.2, 0.3, 0.5],
      sheetThicknessOptions: [2, 2.5, 3, 4, 5],
      widthOptions: [1220, 1500]
    }
  ];

  for (const item of defaults) {
    const existing = await repository.findOne({ material: item.material });
    if (!existing) {
      await repository.create(item);
    }
  }
}
