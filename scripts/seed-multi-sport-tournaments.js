/**
 * Seed demo tournaments (does NOT modify LSA Football 2026).
 * Run: node scripts/seed-multi-sport-tournaments.js
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");

const LSA_ID = "0781ebe3-1f0a-4a1c-a25c-88c984567f7d";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function players(names) {
  return names.map((name, i) => ({ name, shirtNumber: i + 1 }));
}

function club(name, roster) {
  return { name, players: players(roster) };
}

/** Team sports: clubs with full squads */
const FOOTBALL_CLUBS = {
  Teen: [
    club("Northgate Youth", ["Aarav", "Kabir", "Rohan", "Vihaan", "Ishaan", "Dev", "Arjun", "Neil", "Yash", "Krish"]),
    club("Eastside Strikers", ["Harsh", "Om", "Rudra", "Advait", "Reyansh", "Atharv", "Shaurya", "Dhruv", "Veer", "Ansh"]),
    club("Harbor Juniors", ["Kian", "Ayaan", "Samar", "Parth", "Rian", "Aadi", "Manav", "Soham", "Pranav", "Rishi"]),
    club("Valley Warriors", ["Tanish", "Laksh", "Arya", "Vivaan", "Shivansh", "Darsh", "Kush", "Agastya", "Rian M", "Ivaan"]),
    club("Summit FC Teen", ["Zayn", "Noah", "Liam", "Ethan", "Jay", "Ron", "Sam", "Leo", "Kai", "Max"]),
    club("Riverbank United", ["Arnav", "Yug", "Samarth", "Rey", "Nikhil", "Aryan", "Hriday", "Ved", "Shaan", "Kiaan"]),
  ],
  Mens: [
    club("Metro Athletic", ["Rahul", "Vikram", "Sameer", "Imran", "Farhan", "Aditya", "Kunal", "Nikhil", "Siddharth", "Rohit", "Amit"]),
    club("Coastal United", ["Marcus", "Diego", "James", "Omar", "Tyler", "Chris", "Andre", "Luis", "Kevin", "Brian", "Matt"]),
    club("Ironbridge FC", ["Harjit", "Parm", "Gurpreet", "Nav", "Jas", "Amrit", "Bal", "Sukh", "Ravi", "Deep", "Manpreet"]),
    club("Summit City", ["Alex", "Jordan", "Casey", "Riley", "Morgan", "Quinn", "Drew", "Blake", "Cameron", "Taylor", "Parker"]),
    club("Phoenix Rangers", ["Karan", "Varun", "Abhay", "Nitin", "Prateek", "Saurabh", "Ankit", "Gaurav", "Mohit", "Tarun", "Vishal"]),
    club("Lakeside SC", ["Ethan", "Cole", "Ryan", "Jake", "Noah", "Logan", "Hunter", "Chase", "Grant", "Wyatt", "Owen"]),
  ],
  Womens: [
    club("Aurora United", ["Maya", "Priya", "Ananya", "Sara", "Leila", "Nina", "Aisha", "Zara", "Isha", "Meera"]),
    club("Silverleaf FC", ["Emma", "Olivia", "Ava", "Sophia", "Mia", "Isabella", "Charlotte", "Amelia", "Harper", "Evelyn"]),
    club("Rosewood Athletic", ["Diya", "Kavya", "Riya", "Sana", "Tara", "Neha", "Pooja", "Aditi", "Shruti", "Anvi"]),
    club("Northwind WFC", ["Grace", "Chloe", "Zoe", "Lily", "Ella", "Nora", "Hazel", "Violet", "Stella", "Ruby"]),
    club("Cedar Crest", ["Aanya", "Myra", "Kiara", "Inaya", "Aarohi", "Pari", "Saanvi", "Anika", "Navya", "Ira"]),
    club("Horizon Stars", ["Sofia", "Camila", "Valentina", "Lucia", "Elena", "Maria", "Julia", "Clara", "Paula", "Ana"]),
  ],
};

const CRICKET_CLUBS = {
  Mens: [
    club("Kings XI Metro", ["Rohit S", "Virat K", "Hardik", "Jasprit", "Rishabh", "KL", "Surya", "Jadeja", "Ashwin", "Bumrah", "Shami"]),
    club("Coastal Crushers", ["Steve", "David", "Pat", "Mitchell", "Glenn", "Josh", "Travis", "Cameron", "Alex C", "Nathan", "Adam"]),
    club("Thunderbolts CC", ["Kane", "Trent", "Tim", "Devon", "Lockie", "Tom", "Glenn P", "Daryl", "Mitchell S", "Ish", "Matt H"]),
    club("Desert Falcons", ["Babar", "Shaheen", "Rizwan", "Fakhar", "Shadab", "Haris", "Naseem", "Iftikhar", "Imam", "Hasan", "Usman"]),
    club("Greenfield CC", ["Joe", "Ben", "Jos", "Harry", "Jofra", "Mark", "Sam C", "Chris W", "Jonny", "Moeen", "Adil"]),
    club("Riverdale Royals", ["Shubman", "Ishan", "Axar", "Yuzvendra", "Prithvi", "Washington", "Deepak", "Shardul", "Ruturaj", "Tilak", "Arshdeep"]),
  ],
  Teen: [
    club("Academy Aces", ["Aarav C", "Reyansh C", "Vihaan C", "Kabir C", "Ishaan C", "Advait C", "Atharv C", "Shaurya C", "Dhruv C", "Arjun C", "Neil C"]),
    club("Young Guns CC", ["Harsh C", "Om C", "Rudra C", "Dev C", "Yash C", "Krish C", "Parth C", "Manav C", "Soham C", "Pranav C", "Rishi C"]),
    club("Future Stars", ["Tanish C", "Laksh C", "Arya C", "Vivaan C", "Darsh C", "Kush C", "Agastya C", "Ivaan C", "Zayn C", "Kai C", "Max C"]),
    club("Junior Titans", ["Arnav C", "Yug C", "Samarth C", "Nikhil C", "Aryan C", "Hriday C", "Ved C", "Shaan C", "Kiaan C", "Ron C", "Sam C"]),
    club("Rising XI", ["Kian C", "Ayaan C", "Samar C", "Rian C", "Aadi C", "Veer C", "Ansh C", "Jay C", "Leo C", "Ethan C", "Noah C"]),
    club("Net Practice XI", ["Shivansh C", "Rey C", "Liam C", "Hunter C", "Chase C", "Grant C", "Wyatt C", "Owen C", "Blake C", "Drew C", "Quinn C"]),
  ],
  Womens: [
    club("Sapphire Strikers", ["Smriti", "Harmanpreet", "Jemimah", "Deepti", "Shafali", "Richa", "Pooja V", "Renuka", "Amanjot", "Sneh", "Yastika"]),
    club("Emerald XI", ["Ellyse", "Alyssa", "Meg", "Ashleigh", "Beth", "Tahlia", "Annabel", "Phoebe", "Georgia", "Alana", "Jess"]),
    club("Lotus CC", ["Natalie", "Sophie", "Amy", "Heather", "Kate", "Lauren", "Danni", "Tammy", "Charlie", "Freya", "Sarah"]),
    club("Flame Women", ["Hayley", "Amelia K", "Suzie", "Sophie D", "Lea", "Brooke", "Maddy", "Izzy", "Fran", "Georgia P", "Molly"]),
    club("Indigo Queens", ["Bismah", "Nida", "Muneeba", "Aliya", "Fatima", "Sidra", "Nashra", "Diana", "Omaima", "Ayesha", "Gull"]),
    club("Pearl XI", ["Meghana", "Richa G", "Dayalan", "Taniya", "Sabbhineni", "Minnu", "Uma", "Kanika", "Shweta", "Priya C", "Anusha"]),
  ],
};

/** Racquet sports: each "team" is an entry (1 or 2 players) */
function singlesEntries(prefix, names) {
  return names.map((name, i) => ({
    name: `${name}`,
    players: [{ name, shirtNumber: 1 }],
  }));
}

function pairEntries(pairs) {
  return pairs.map(([a, b], i) => ({
    name: `${a} / ${b}`,
    players: [
      { name: a, shirtNumber: 1 },
      { name: b, shirtNumber: 2 },
    ],
  }));
}

const BADMINTON = {
  Singles: singlesEntries("BD", [
    "Kenji Sato",
    "Marcus Lee",
    "Priya Nair",
    "Elena Volkova",
    "Rahul Mehta",
    "Sofia Alvarez",
    "Daniel Cho",
    "Aisha Khan",
  ]),
  Doubles: pairEntries([
    ["Tom Hughes", "Ben Carter"],
    ["Wei Chen", "Jun Park"],
    ["Omar Hassan", "Luis Rivera"],
    ["Ryan Patel", "Chris Wong"],
    ["Alex Kim", "Jordan Blake"],
    ["Sam Okonkwo", "Leo Martins"],
  ]),
  Mixed: pairEntries([
    ["Arjun Rao", "Maya Sen"],
    ["Noah Brooks", "Lily Chen"],
    ["Kabir Shah", "Zara Ahmed"],
    ["Ethan Cole", "Ava Martinez"],
    ["Hiro Tanaka", "Yuki Mori"],
    ["Dev Kapoor", "Ananya Iyer"],
  ]),
};

const PICKLEBALL = {
  Singles: singlesEntries("PB", [
    "Jake Morrison",
    "Nina Patel",
    "Carlos Diaz",
    "Emma Wright",
    "Tyler Brooks",
    "Sophie Kim",
    "Andre Silva",
    "Grace Liu",
  ]),
  Doubles: pairEntries([
    ["Mike Torres", "Dan Foster"],
    ["Chris Evans", "Paul Nguyen"],
    ["Raj Gupta", "Vic Singh"],
    ["Ben Shaw", "Adam Cruz"],
    ["Kyle Reed", "Ian Holt"],
    ["Mark Diaz", "Joe Park"],
  ]),
  Mixed: pairEntries([
    ["Sam Rivera", "Olivia Cho"],
    ["Liam Hart", "Mia Santos"],
    ["Noah Kim", "Ella Park"],
    ["Aiden Shaw", "Chloe Nguyen"],
    ["Ryan Lee", "Zoe Brooks"],
    ["Ethan Diaz", "Aria Patel"],
  ]),
};

async function createTournament({ name, startDate, categories }) {
  const existing = await prisma.tournament.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    if (existing.id === LSA_ID) {
      throw new Error("Refusing to touch LSA tournament");
    }
    console.log(`  skip (exists): ${name}`);
    return existing;
  }

  const tournament = await prisma.tournament.create({
    data: {
      name,
      startDate: new Date(startDate),
      categories: {
        create: categories.map((c) => ({
          name: c.name,
          sport: c.sport,
          oversPerInnings: c.oversPerInnings ?? null,
          fullTimeMinutes: c.fullTimeMinutes ?? null,
          extraTimeMinutes: c.extraTimeMinutes ?? null,
          scheduleFormat: "ROUND_ROBIN",
          teams: {
            create: c.teams.map((t) => ({
              name: t.name,
              players: {
                create: t.players.map((p) => ({
                  name: p.name,
                  shirtNumber: p.shirtNumber,
                })),
              },
            })),
          },
        })),
      },
    },
    include: {
      categories: {
        include: { _count: { select: { teams: true } } },
      },
    },
  });

  console.log(`  created: ${name} (${tournament.id})`);
  for (const cat of tournament.categories) {
    console.log(`    ${cat.sport} · ${cat.name} · ${cat._count.teams} entries`);
  }
  return tournament;
}

async function main() {
  const lsa = await prisma.tournament.findUnique({
    where: { id: LSA_ID },
    select: { id: true, name: true },
  });
  if (!lsa) {
    console.warn("Warning: LSA tournament id not found (continuing anyway)");
  } else {
    console.log("LSA protected:", lsa.name, lsa.id);
  }

  console.log("\nSeeding multi-sport tournaments…");

  await createTournament({
    name: "Force Pulse Cricket 2026",
    startDate: "2026-08-01",
    categories: [
      {
        name: "Mens",
        sport: "CRICKET",
        oversPerInnings: 20,
        teams: CRICKET_CLUBS.Mens,
      },
      {
        name: "Teen",
        sport: "CRICKET",
        oversPerInnings: 15,
        teams: CRICKET_CLUBS.Teen,
      },
      {
        name: "Womens",
        sport: "CRICKET",
        oversPerInnings: 20,
        teams: CRICKET_CLUBS.Womens,
      },
    ],
  });

  await createTournament({
    name: "Force Pulse Football 2026",
    startDate: "2026-08-08",
    categories: [
      {
        name: "Teen",
        sport: "FOOTBALL",
        fullTimeMinutes: 20,
        teams: FOOTBALL_CLUBS.Teen,
      },
      {
        name: "Mens",
        sport: "FOOTBALL",
        fullTimeMinutes: 40,
        teams: FOOTBALL_CLUBS.Mens,
      },
      {
        name: "Womens",
        sport: "FOOTBALL",
        fullTimeMinutes: 40,
        teams: FOOTBALL_CLUBS.Womens,
      },
    ],
  });

  await createTournament({
    name: "Force Pulse Badminton 2026",
    startDate: "2026-08-15",
    categories: [
      { name: "Singles", sport: "BADMINTON", teams: BADMINTON.Singles },
      { name: "Doubles", sport: "BADMINTON", teams: BADMINTON.Doubles },
      { name: "Mixed", sport: "BADMINTON", teams: BADMINTON.Mixed },
    ],
  });

  await createTournament({
    name: "Force Pulse Pickleball 2026",
    startDate: "2026-08-22",
    categories: [
      { name: "Singles", sport: "PICKLEBALL", teams: PICKLEBALL.Singles },
      { name: "Doubles", sport: "PICKLEBALL", teams: PICKLEBALL.Doubles },
      { name: "Mixed", sport: "PICKLEBALL", teams: PICKLEBALL.Mixed },
    ],
  });

  console.log("\nDone. LSA unchanged.");
  const all = await prisma.tournament.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      categories: {
        select: {
          name: true,
          sport: true,
          _count: { select: { teams: true } },
        },
      },
    },
  });
  console.log("\nAll tournaments:");
  for (const t of all) {
    const mark = t.id === LSA_ID ? " [LSA — untouched]" : "";
    console.log(`- ${t.name}${mark}`);
    for (const c of t.categories) {
      console.log(`    ${c.sport} ${c.name}: ${c._count.teams} teams`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
