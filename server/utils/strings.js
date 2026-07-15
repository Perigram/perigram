export function generateRandomString(count) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < count; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function generateEntityName() {
  const adjectives = [
    "brave",
    "clever",
    "bright",
    "swift",
    "mighty",
    "calm",
    "gentle",
    "fierce",
    "happy",
    "bold",
  ];
  const nouns = [
    "turing",
    "curie",
    "einstein",
    "newton",
    "tesla",
    "bohr",
    "feynman",
    "lovelace",
    "hopper",
    "galileo",
  ];

  const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const name = `${getRandomElement(adjectives)}-${getRandomElement(nouns)}`;

  return name;
}

export async function streamToString(readable) {
  let result = "";
  for await (const chunk of readable) {
    result += chunk;
  }
  return result;
}

export function pluralize(entityType) {
  if (!entityType) return '';
  if (entityType === 'cassette_instance') return 'cassette_instances';
  if (entityType === 'sheet_design') return 'sheet_designs';
  if (entityType === 'cassette_design') return 'cassette_designs';
  if (entityType === 'layer_standard') return 'layer_standards';
  if (entityType === 'pen_template') return 'pen_templates';
  if (entityType === 'material_pile') return 'material_piles';
  if (entityType === 'material_option') return 'material_options';
  return `${entityType}s`;
}
