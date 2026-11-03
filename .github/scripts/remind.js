// Sends the daily goal reminder push. Run by .github/workflows/reminder.yml.
//   node remind.js check -> works out if any device is due, writes send=true/false for the workflow
//   node remind.js send  -> sends the push (needs the web-push package)
// STINT_PUSH (a GitHub secret) is the setup code from Stint, or a JSON list of codes for several devices:
//   { subscription, publicKey, privateKey, timeZone, time: "HH:MM", days: [0-6, 0 = Sunday] }
// TEST=true (the "Run workflow" button) sends a test push to every device right away.

const fs = require("fs");

const SLOT_MINUTES = [7, 37]; // must match the cron in reminder.yml
const SLOT_GAP = 30;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function readConfigs() {
  const raw = (process.env.STINT_PUSH || "").trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Don't print the parse error: it can include part of the secret
    throw new Error("STINT_PUSH isn't valid. Copy the setup code from Stint again and replace the secret.");
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

// The run this should have been (GitHub often starts late, so we don't trust the clock to the minute)
function scheduledSlot(now) {
  const slot = new Date(now);
  slot.setUTCSeconds(0, 0);
  const m = slot.getUTCMinutes();
  const past = SLOT_MINUTES.filter((x) => x <= m);
  if (past.length) slot.setUTCMinutes(Math.max(...past));
  else slot.setUTCHours(slot.getUTCHours() - 1, Math.max(...SLOT_MINUTES));
  return slot;
}

// Local weekday and minutes since midnight in the phone's time zone
function localTime(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { day: WEEKDAYS.indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Each reminder time belongs to exactly one slot: the first one at or after it
function isDue(config, slot) {
  const { day, minutes } = localTime(slot, config.timeZone);
  const [h, m] = config.time.split(":").map(Number);
  const since = minutes - (h * 60 + m);
  return since >= 0 && since < SLOT_GAP && (config.days || []).includes(day);
}

function dueConfigs(now = new Date()) {
  const configs = readConfigs();
  if (process.env.TEST === "true") return configs;
  const slot = scheduledSlot(now);
  return configs.filter((c) => isDue(c, slot));
}

async function main() {
  const mode = process.argv[2];
  const configs = readConfigs();
  if (!configs.length) {
    console.log("No STINT_PUSH secret yet, nothing to do. Set it up from Stint: ⋯ → Reminders when Stint is closed.");
  }
  const due = dueConfigs();

  if (mode === "check") {
    console.log(`${due.length} of ${configs.length} device(s) due.`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `send=${due.length > 0}\n`);
    return;
  }

  if (mode === "send") {
    const webpush = require("web-push");
    const payload = JSON.stringify({ type: process.env.TEST === "true" ? "test" : "reminder" });
    let failed = 0;
    for (const [i, c] of due.entries()) {
      try {
        await webpush.sendNotification(c.subscription, payload, {
          TTL: 60 * 60, // drop it if the phone is offline for over an hour
          urgency: "high",
          vapidDetails: { subject: "https://zxdr4gon.github.io/hourstracker/", publicKey: c.publicKey, privateKey: c.privateKey },
        });
        console.log(`Device ${i + 1}: sent.`);
      } catch (err) {
        failed++;
        const gone = err.statusCode === 404 || err.statusCode === 410;
        console.log(`Device ${i + 1}: failed (${err.statusCode || err.message}).` +
          (gone ? " This phone's subscription has expired: make a new setup code in Stint and update the secret." : ""));
      }
    }
    if (failed) process.exitCode = 1;
    return;
  }

  console.log("Usage: node remind.js check|send");
  process.exitCode = 1;
}

module.exports = { scheduledSlot, localTime, isDue };
if (require.main === module) {
  main().catch((err) => {
    console.log(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
