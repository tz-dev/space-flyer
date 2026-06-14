// Deterministic, combinatorial names for Space-Flyer systems and objects.
// The generator is intentionally dictionary-light: small syllable/catalog pools
// plus an integer seed produce stable names without persisting generated lists.

export const STELLAR_CATEGORIES = Object.freeze({
  STAR: "star",
  PLANET: "planet",
  BLACK_HOLE: "blackHole",
  PULSAR: "pulsar",
  NEUTRON_STAR: "neutronStar",
  QUASAR: "quasar",
  NEBULA: "nebula"
});

const GREEK_LETTERS = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
  "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi",
  "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
];

const CONSTELLATIONS_GEN = [
  "Andromedae", "Antliae", "Apodis", "Aquarii", "Aquilae", "Arae",
  "Arietis", "Aurigae", "Bootis", "Caeli", "Camelopardalis", "Cancri",
  "Canis Majoris", "Canis Minoris", "Capricorni", "Carinae", "Cassiopeiae",
  "Centauri", "Cephei", "Ceti", "Chamaeleontis", "Circini", "Columbae",
  "Comae Berenices", "Coronae Australis", "Coronae Borealis", "Corvi",
  "Crateris", "Crucis", "Cygni", "Delphini", "Doradus", "Draconis",
  "Equulei", "Eridani", "Fornacis", "Geminorum", "Gruis", "Herculis",
  "Horologii", "Hydrae", "Hydri", "Indi", "Lacertae", "Leonis",
  "Leonis Minoris", "Leporis", "Librae", "Lupi", "Lyncis", "Lyrae",
  "Mensaes", "Microscopii", "Monocerotis", "Muscae", "Normae", "Octantis",
  "Ophiuchi", "Orionis", "Pavonis", "Pegasi", "Persei", "Phoenicis",
  "Pictoris", "Piscium", "Piscis Austrini", "Puppis", "Pyxidis", "Reticuli",
  "Sagittae", "Sagittarii", "Scorpii", "Sculptoris", "Scuti", "Serpentis",
  "Sextantis", "Tauri", "Telescopii", "Trianguli", "Trianguli Australis",
  "Tucanae", "Ursae Majoris", "Ursae Minoris", "Velorum", "Virginis",
  "Volantis", "Vulpeculae"
];

const SURVEY_PREFIXES = {
  blackHole: ["GRS", "GRO J", "MAXI J", "Swift J", "XTE J", "IGR J"],
  pulsar: ["PSR J"],
  neutronStar: ["RX J", "1E", "SAX J", "1RXS J", "XMMU J"],
  quasar: ["3C", "PKS", "SDSS J", "QSO J", "4C"],
  nebula: ["NGC", "IC", "Sh2", "RCW", "LBN"]
};

const SYLLABLES_START = [
  "Al", "Ari", "Aster", "Be", "Bel", "Cael", "Cor", "Cyr", "Dra", "Dym",
  "El", "Eos", "Fen", "Fer", "Gar", "Gly", "Hyl", "Hel", "Iv", "Ith",
  "Jor", "Jun", "Kel", "Kyr", "Lor", "Lys", "Mir", "Myrr", "Nyx", "Nir",
  "Or", "Oph", "Pyr", "Phael", "Quel", "Quor", "Rha", "Ryn", "Sol", "Ser",
  "Tor", "Tha", "Ul", "Umb", "Vey", "Vor", "Wyn", "Wol", "Xal", "Xyr",
  "Yir", "Ysol", "Zar", "Zyn"
];

const SYLLABLES_MID = [
  "an", "ael", "ar", "ath", "el", "eir", "en", "esh", "ev", "ia",
  "iel", "imir", "in", "ira", "is", "ith", "oa", "ol", "ona", "ond",
  "or", "oth", "ova", "rae", "ri", "ryn", "ul", "uri", "us", "yra",
  "yr", "zen"
];

const SYLLABLES_END = [
  "a", "ae", "ara", "ar", "ax", "eon", "esh", "eth", "ia", "iel",
  "ion", "ir", "is", "ix", "om", "on", "or", "ora", "os", "oth",
  "ova", "une", "us", "yn", "ys", "zar", "en", "eia", "aun", "aris",
  "eron", "essa"
];

const NEBULA_ADJECTIVES = [
  "Crimson", "Azure", "Veiled", "Burning", "Whispering", "Silent",
  "Shattered", "Glowing", "Frozen", "Spiraling", "Drifting", "Radiant",
  "Hollow", "Wandering", "Ember", "Twilight", "Pale", "Echoing",
  "Forgotten", "Luminous", "Shrouded", "Distant", "Restless", "Ashen"
];

const NEBULA_NOUNS = [
  "Veil", "Crown", "Reach", "Cradle", "Drift", "Bloom", "Shroud",
  "Halo", "Expanse", "Curtain", "Wisp", "Crest", "Span", "Garden",
  "Spire", "Tide", "Plume", "Arc", "Hollow", "Web"
];


const PLANET_ADJECTIVES = [
  "Aurelian", "Vesper", "Cindering", "Pale", "Rusted", "Cerulean",
  "Ashen", "Ivory", "Obsidian", "Verdant", "Saffron", "Iridescent",
  "Hollow", "Glacial", "Ember", "Tidal", "Dusken", "Copper",
  "Silent", "Wandering", "Frosted", "Amber", "Umbral", "Opaline"
];

const PLANET_NOUNS = [
  "Reach", "Vale", "Crown", "Drift", "Haven", "Mire", "Basin", "Crest",
  "Steppe", "Hollow", "Tide", "Spire", "Plain", "Wold", "Cradle",
  "Ridge", "Garden", "Wastes", "Arch", "Fjord", "Mesa", "Breach"
];

const PLANET_CATALOG_PREFIXES = [
  "Kepler", "TOI", "KOI", "Gliese", "LHS", "HD", "BD", "HIP"
];

const PLANET_SUFFIXES = "bcdefghijklmnopqrstuvwxyz".split("");

export function hashInt(seed, salt = 0) {
  let h = (Number(seed) ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function coordDesignation(seed) {
  const raTotalMinutes = hashInt(seed, 1) % (24 * 60);
  const raH = Math.floor(raTotalMinutes / 60);
  const raM = raTotalMinutes % 60;
  const decTotalMinutes = hashInt(seed, 2) % (90 * 60);
  const decD = Math.floor(decTotalMinutes / 60);
  const decM = decTotalMinutes % 60;
  const decSign = hashInt(seed, 3) % 2 === 0 ? "+" : "-";

  return `${pad(raH, 2)}${pad(raM, 2)}${decSign}${pad(decD, 2)}${pad(decM, 2)}`;
}

export function generateStellarName(category, seed, options = {}) {
  switch (category) {
    case STELLAR_CATEGORIES.STAR:
      return generateStarName(seed);
    case STELLAR_CATEGORIES.PLANET:
      return generatePlanetName(seed, options);
    case STELLAR_CATEGORIES.BLACK_HOLE:
      return generateBlackHoleName(seed);
    case STELLAR_CATEGORIES.PULSAR:
      return generatePulsarName(seed);
    case STELLAR_CATEGORIES.NEUTRON_STAR:
      return generateNeutronStarName(seed);
    case STELLAR_CATEGORIES.QUASAR:
      return generateQuasarName(seed);
    case STELLAR_CATEGORIES.NEBULA:
      return generateNebulaName(seed);
    default:
      throw new Error(`generateStellarName: unknown category "${category}"`);
  }
}

export function generateUniqueStellarName(category, seed, usedNames, options = {}) {
  let attempt = 0;
  let name = generateStellarName(category, seed, options);

  while (usedNames?.has(name) && attempt < 50) {
    attempt += 1;
    name = generateStellarName(category, hashInt(seed, 1000 + attempt), options);
  }

  usedNames?.add(name);
  return name;
}

function generateStarName(seed) {
  const mode = hashInt(seed, 10) % 100;

  if (mode < 58) {
    return generateProperName(seed, 100);
  }

  if (mode < 82) {
    const greek = pick(GREEK_LETTERS, seed, 11);
    const constellation = pick(CONSTELLATIONS_GEN, seed, 12);
    return `${greek} ${constellation}`;
  }

  if (mode < 94) {
    return `HD ${10000 + (hashInt(seed, 13) % 890000)}`;
  }

  return `SAO ${10000 + (hashInt(seed, 14) % 240000)}`;
}

function generatePlanetName(seed, options = {}) {
  const namingMode = options.namingMode ?? "proper";
  const parentStarName = options.parentStarName;

  const suffixIndex = Number.isInteger(options.planetIndex)
    ? Math.max(0, options.planetIndex) % PLANET_SUFFIXES.length
    : hashInt(seed, 20) % PLANET_SUFFIXES.length;

  if (namingMode === "designation") {
    if (!parentStarName) {
      throw new Error("generateStellarName: 'parentStarName' is required for planet designations");
    }

    return `${parentStarName} ${PLANET_SUFFIXES[suffixIndex]}`;
  }

  const mode = hashInt(seed, 21) % 100;

  if (mode < 72) {
    return generateProperName(seed, 220);
  }

  if (mode < 90) {
    const adjective = pick(PLANET_ADJECTIVES, seed, 230);
    const noun = pick(PLANET_NOUNS, seed, 231);
    return `${adjective} ${noun}`;
  }

  const prefix = pick(PLANET_CATALOG_PREFIXES, seed, 240);
  const number = 100 + (hashInt(seed, 241) % 9900);
  const suffix = PLANET_SUFFIXES[suffixIndex];
  return `${prefix}-${number}${suffix}`;
}

function generateBlackHoleName(seed) {
  if (hashInt(seed, 30) % 2 === 0) {
    const constellation = pick(CONSTELLATIONS_GEN, seed, 31);
    const abbr = constellation.slice(0, 3);
    const number = (hashInt(seed, 32) % 12) + 1;
    return `${abbr} X-${number}`;
  }

  const prefix = pick(SURVEY_PREFIXES.blackHole, seed, 33);
  return joinCatalogPrefix(prefix, coordDesignation(seed));
}

function generatePulsarName(seed) {
  return `PSR J${coordDesignation(seed)}`;
}

function generateNeutronStarName(seed) {
  const prefix = pick(SURVEY_PREFIXES.neutronStar, seed, 40);
  return joinCatalogPrefix(prefix, coordDesignation(seed));
}

function generateQuasarName(seed) {
  const prefix = pick(SURVEY_PREFIXES.quasar, seed, 50);

  if (prefix.endsWith("J")) {
    return `${prefix}${coordDesignation(seed)}`;
  }

  const number = (hashInt(seed, 51) % 9999) + 1;
  return `${prefix} ${number}`;
}

function generateNebulaName(seed) {
  if (hashInt(seed, 60) % 2 === 0) {
    const adjective = pick(NEBULA_ADJECTIVES, seed, 61);
    const noun = pick(NEBULA_NOUNS, seed, 62);
    return `${adjective} ${noun} Nebula`;
  }

  const prefix = pick(SURVEY_PREFIXES.nebula, seed, 63);
  const number = (hashInt(seed, 64) % 9999) + 1;
  return `${prefix} ${number}`;
}

function generateProperName(seed, saltOffset = 0) {
  const start = pick(SYLLABLES_START, seed, saltOffset + 1);
  const mid = pick(SYLLABLES_MID, seed, saltOffset + 2);
  const end = pick(SYLLABLES_END, seed, saltOffset + 3);
  const extra = pick(SYLLABLES_MID, seed, saltOffset + 5);
  const mode = hashInt(seed, saltOffset + 4) % 100;

  if (mode < 18) {
    return `${start}${end}`;
  }

  if (mode < 86) {
    return `${start}${mid}${end}`;
  }

  return `${start}${mid}${extra}${end}`;
}

function joinCatalogPrefix(prefix, designation) {
  return prefix.endsWith("J") ? `${prefix}${designation}` : `${prefix} ${designation}`;
}

function pick(list, seed, salt) {
  return list[hashInt(seed, salt) % list.length];
}

function pad(num, width) {
  return String(num).padStart(width, "0");
}
