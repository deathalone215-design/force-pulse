require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const u15Teams = [
  {
    name: "WP Smashers (U15)",
    players: [
      { name: "Abir", shirtNumber: 12 },
      { name: "Sathu", shirtNumber: 24 },
      { name: "Harsh", shirtNumber: 23 },
      { name: "Dev", shirtNumber: 5 },
      { name: "Shine", shirtNumber: 8 },
      { name: "Adi", shirtNumber: 50 },
      { name: "Ruchir", shirtNumber: 3 },
      { name: "Ayush", shirtNumber: 68 }
    ]
  },
  {
    name: "Octastar Juniors",
    players: [
      { name: "Akash", shirtNumber: 17 },
      { name: "Manav", shirtNumber: 5 },
      { name: "Aadit", shirtNumber: 16 },
      { name: "Rishabh", shirtNumber: 2 },
      { name: "Arjun", shirtNumber: 10 },
      { name: "Ayush", shirtNumber: 37 },
      { name: "Arnav", shirtNumber: 2 },
      { name: "Soham", shirtNumber: 73 },
      { name: "Satvik", shirtNumber: 12 },
      { name: "Sourav", shirtNumber: 11 }
    ]
  },
  {
    name: "OCTA VIKINGS",
    players: [
      { name: "MAHIR", shirtNumber: 4 },
      { name: "KYLE", shirtNumber: 10 },
      { name: "RISHEET", shirtNumber: 5 },
      { name: "SAM", shirtNumber: 14 },
      { name: "AARUSH", shirtNumber: 23 },
      { name: "SHARMA", shirtNumber: 17 },
      { name: "RUDY", shirtNumber: 13 },
      { name: "AARYAN", shirtNumber: 11 }
    ]
  },
  {
    name: "RIVIERA BLASTERS",
    players: [
      { name: "Daniel", shirtNumber: 1 },
      { name: "Dev", shirtNumber: 5 },
      { name: "Hridhaan", shirtNumber: 10 },
      { name: "Sourik", shirtNumber: 11 },
      { name: "Sapnik", shirtNumber: 7 },
      { name: "Ansh", shirtNumber: 9 },
      { name: "Sakshit", shirtNumber: 4 },
      { name: "Yug S", shirtNumber: 6 },
      { name: "Yug K", shirtNumber: 8 },
      { name: "Krissh", shirtNumber: 17 },
      { name: "Arnav", shirtNumber: 22 }
    ]
  },
  {
    name: "WhiteCity Elite",
    players: [
      { name: "Ronak", shirtNumber: 13 },
      { name: "Aastik", shirtNumber: 1 },
      { name: "Parth", shirtNumber: 3 },
      { name: "Dhrav", shirtNumber: 2 },
      { name: "Kushagara", shirtNumber: 12 },
      { name: "Aayush", shirtNumber: 4 },
      { name: "Agasthya", shirtNumber: 9 },
      { name: "Soumik", shirtNumber: 11 },
      { name: "Anshu", shirtNumber: 6 },
      { name: "Rihan", shirtNumber: 10 }
    ]
  },
  {
    name: "SIERRA WARRIORS",
    players: [
      { name: "Vihaan deepak", shirtNumber: 3 },
      { name: "Agastya Deepak", shirtNumber: 9 },
      { name: "Vihaan bollya", shirtNumber: 1 },
      { name: "Namish Agarwal", shirtNumber: 5 },
      { name: "Om yadav", shirtNumber: 7 },
      { name: "Swaraj Shrikule", shirtNumber: 2 },
      { name: "Rudra Deepani", shirtNumber: 4 },
      { name: "Darsh Rathi", shirtNumber: 6 }
    ]
  },
  {
    name: "SAPPHIRE FC",
    players: [
      { name: "Laksh", shirtNumber: 2 },
      { name: "Anique", shirtNumber: 7 },
      { name: "Rudra", shirtNumber: 9 },
      { name: "Aayan", shirtNumber: 11 },
      { name: "Aarav", shirtNumber: 12 },
      { name: "Suyog", shirtNumber: 1 },
      { name: "dhruv", shirtNumber: 10 },
      { name: "Agasthya", shirtNumber: 3 },
      { name: "anshuman", shirtNumber: 5 },
      { name: "shlok", shirtNumber: 13 }
    ]
  }
];

const u15Placeholders = [
  { name: "1st Placed Team" },
  { name: "2nd Placed Team" },
  { name: "3rd Placed Team" },
  { name: "4th Placed Team" },
  { name: "Winner SF1" },
  { name: "Winner SF2" }
];

const openTeams = [
  {
    name: "WP Smashers (Open)",
    players: [
      { name: "binin", shirtNumber: 14 },
      { name: "Mohsin", shirtNumber: 18 },
      { name: "Mayank", shirtNumber: 8 },
      { name: "rishit", shirtNumber: 9 },
      { name: "swayam", shirtNumber: 7 },
      { name: "Bipin", shirtNumber: 1 },
      { name: "Shantanu", shirtNumber: 69 },
      { name: "sahil", shirtNumber: 10 },
      { name: "manav", shirtNumber: 11 },
      { name: "Kabir", shirtNumber: 24 },
      { name: "Sumeet", shirtNumber: 2 }
    ]
  },
  {
    name: "GreenHills FC",
    players: [
      { name: "Gagan", shirtNumber: 72 },
      { name: "Kush", shirtNumber: 4 },
      { name: "Mayank", shirtNumber: 9 },
      { name: "Umang", shirtNumber: 9 },
      { name: "Gedik", shirtNumber: 2 },
      { name: "Dev", shirtNumber: 11 },
      { name: "Aditya", shirtNumber: 8 },
      { name: "Abhinav", shirtNumber: 23 },
      { name: "Prateek", shirtNumber: 10 },
      { name: "Manish", shirtNumber: 7 },
      { name: "Aryan", shirtNumber: 1 }
    ]
  },
  {
    name: "Rivera Aces",
    players: [
      { name: "Hussein", shirtNumber: 10 },
      { name: "Nishit", shirtNumber: 19 },
      { name: "Rean", shirtNumber: 7 },
      { name: "vishal", shirtNumber: 11 },
      { name: "Prithvi", shirtNumber: 15 },
      { name: "Jayesh", shirtNumber: 5 },
      { name: "Krushang", shirtNumber: 1 },
      { name: "Anubhav", shirtNumber: 17 }
    ]
  },
  {
    name: "Sapphire Sharks",
    players: [
      { name: "Thayer", shirtNumber: 11 },
      { name: "Mohapatra", shirtNumber: 4 },
      { name: "Aman", shirtNumber: 10 },
      { name: "Kabir", shirtNumber: 8 },
      { name: "Ishan", shirtNumber: 2 },
      { name: "Ankur", shirtNumber: 3 },
      { name: "Anique", shirtNumber: 7 },
      { name: "Tanishq", shirtNumber: 12 },
      { name: "raj", shirtNumber: 21 },
      { name: "Rajat", shirtNumber: 9 }
    ]
  },
  {
    name: "Spring Leaf United",
    players: [
      { name: "RAJIV", shirtNumber: 10 },
      { name: "PRADEEP", shirtNumber: 12 },
      { name: "KAVIN", shirtNumber: 15 },
      { name: "RUDRA", shirtNumber: 9 },
      { name: "KESHAV", shirtNumber: 11 },
      { name: "MANAN", shirtNumber: 5 },
      { name: "DHAIRYA", shirtNumber: 7 },
      { name: "ABHISHEK", shirtNumber: 4 },
      { name: "AARUSH", shirtNumber: 8 },
      { name: "VIHAAN", shirtNumber: 2 }
    ]
  },
  {
    name: "Alice Super FC",
    players: [
      { name: "VAIBHAV", shirtNumber: 14 },
      { name: "VIREN", shirtNumber: 22 },
      { name: "SOHAM", shirtNumber: 10 },
      { name: "VAIBHAV", shirtNumber: 25 },
      { name: "TASNEEM", shirtNumber: 23 },
      { name: "PARTH", shirtNumber: 11 },
      { name: "SIDDHANT", shirtNumber: 13 },
      { name: "GURJIT", shirtNumber: 7 },
      { name: "AGGASTYA", shirtNumber: 9 },
      { name: "DEEP", shirtNumber: 43 }
    ]
  }
];

function mapTeamName(name) {
  const norm = name.trim().toLowerCase();
  if (norm === "sierra warriors") return "SIERRA WARRIORS";
  if (norm === "octa vikings") return "OCTA VIKINGS";
  if (norm === "wp smashers") return "WP Smashers (U15)";
  if (norm === "octastar juniors") return "Octastar Juniors";
  if (norm === "white city") return "WhiteCity Elite";
  if (norm === "sapphire fc") return "SAPPHIRE FC";
  if (norm === "rivera blasters") return "RIVIERA BLASTERS";

  if (norm === "1st placed team") return "1st Placed Team";
  if (norm === "2nd placed team") return "2nd Placed Team";
  if (norm === "3rd placed team") return "3rd Placed Team";
  if (norm === "4th placed team") return "4th Placed Team";
  if (norm === "winner sf1") return "Winner SF1";
  if (norm === "winner sf2") return "Winner SF2";

  return name;
}

const saturdayMatches = [
  { a: "Sierra Warriors", b: "Octa Vikings" },
  { a: "WP Smashers", b: "OctaStar Juniors" },
  { a: "White City", b: "Sapphire FC" },
  { a: "Sierra Warriors", b: "Rivera Blasters" },
  { a: "Octa Vikings", b: "WP Smashers" },
  { a: "OctaStar Juniors", b: "White City" },
  { a: "Sapphire FC", b: "Rivera Blasters" },
  { a: "Sierra Warriors", b: "WP Smashers" },
  { a: "Octa Vikings", b: "OctaStar Juniors" },
  { a: "White City", b: "Rivera Blasters" }
];

const sundayMatches = [
  { a: "Sierra Warriors", b: "Sapphire FC" },
  { a: "WP Smashers", b: "White City" },
  { a: "Octa Vikings", b: "Rivera Blasters" },
  { a: "OctaStar Juniors", b: "Sapphire FC" }
];

const semiFinalMatches = [
  { a: "1st Placed Team", b: "4th Placed Team" },
  { a: "2nd Placed Team", b: "3rd Placed Team" }
];

const finalMatch = [
  { a: "Winner SF1", b: "Winner SF2" }
];

async function main() {
  console.log("Cleaning database...");
  await prisma.tournament.deleteMany({});

  console.log("Creating Match Day Championship 2026...");
  const tournament = await prisma.tournament.create({
    data: {
      name: "Match Day Championship 2026",
      startDate: new Date("2026-07-18"),
      categories: {
        create: [
          { name: "U15" },
          { name: "OPEN" },
        ],
      },
    },
    include: { categories: true },
  });

  const u15Category = tournament.categories.find((c) => c.name === "U15");
  const openCategory = tournament.categories.find((c) => c.name === "OPEN");

  console.log(`Adding ${u15Teams.length} teams to U15 category...`);
  const u15DbTeams = {};
  for (const t of u15Teams) {
    const dbTeam = await prisma.team.create({
      data: {
        name: t.name,
        categoryId: u15Category.id,
        players: { create: t.players },
      },
    });
    u15DbTeams[dbTeam.name] = dbTeam.id;
  }

  console.log("Adding knockout placeholders to U15...");
  for (const t of u15Placeholders) {
    const dbTeam = await prisma.team.create({
      data: {
        name: t.name,
        categoryId: u15Category.id,
      },
    });
    u15DbTeams[dbTeam.name] = dbTeam.id;
  }

  console.log("Seeding U15 fixtures...");
  await prisma.round.create({
    data: {
      number: 1,
      categoryId: u15Category.id,
      matches: {
        create: saturdayMatches.map((m) => ({
          teamAId: u15DbTeams[mapTeamName(m.a)],
          teamBId: u15DbTeams[mapTeamName(m.b)],
          status: "SCHEDULED",
        })),
      },
    },
  });

  await prisma.round.create({
    data: {
      number: 2,
      categoryId: u15Category.id,
      matches: {
        create: sundayMatches.map((m) => ({
          teamAId: u15DbTeams[mapTeamName(m.a)],
          teamBId: u15DbTeams[mapTeamName(m.b)],
          status: "SCHEDULED",
        })),
      },
    },
  });

  await prisma.round.create({
    data: {
      number: 3,
      categoryId: u15Category.id,
      matches: {
        create: semiFinalMatches.map((m) => ({
          teamAId: u15DbTeams[mapTeamName(m.a)],
          teamBId: u15DbTeams[mapTeamName(m.b)],
          status: "SCHEDULED",
        })),
      },
    },
  });

  await prisma.round.create({
    data: {
      number: 4,
      categoryId: u15Category.id,
      matches: {
        create: finalMatch.map((m) => ({
          teamAId: u15DbTeams[mapTeamName(m.a)],
          teamBId: u15DbTeams[mapTeamName(m.b)],
          status: "SCHEDULED",
        })),
      },
    },
  });

  console.log(`Adding ${openTeams.length} teams to OPEN category...`);
  for (const t of openTeams) {
    await prisma.team.create({
      data: {
        name: t.name,
        categoryId: openCategory.id,
        players: { create: t.players },
      },
    });
  }

  console.log("Database seeded: one tournament with U15 + OPEN categories!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
