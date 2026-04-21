# Outbreak Response

A cooperative web-based multiplayer game for **2 to 6 players** about pathogens, prevention, and treatment. Players work together as a medical response team to contain outbreaks across six world regions before three of them fall.

The game is built to meet these design goals:

- **Informative.** Real pathogens from four categories (virus, bacteria, fungus, parasite) with factual prevention and treatment methods pulled up during play.
- **Cooperative.** Everyone wins or loses together. Players must share knowledge, move between regions, and coordinate actions.
- **Unique.** A quiz-driven action system where every treatment or prevention attempt is a public-health decision that can succeed or fail.
- **Easy to learn, deep enough for 15 to 30 minutes of play.**
- **Appropriate for a middle- or high-school audience.**
- **No installation for players.** Just open a URL on any phone, tablet, or laptop on the same Wi-Fi.

## Requirements

- Node.js 18+ (no npm install needed — the server uses only Node built-ins).

## Run it

```bash
node server.js
```

The server prints both a local URL and a LAN URL. Anyone on the same Wi-Fi can open the LAN URL (e.g. `http://192.168.1.42:3000`) on their phone/laptop and play. The host creates a room, shares the 4-letter code, everyone joins, and the host starts the game.

To change the port: `PORT=8080 node server.js`.

## How to play

1. One player creates a room and shares the code.
2. Each player gets a randomly assigned role (Doctor, Nurse, Scientist, Educator, Logistics, First Responder) with a special ability.
3. Each turn, the active player spends up to **3 action points** (4 for First Responder):
   - **Move** to an adjacent region (1 AP).
   - **Treat** an infection in the current region (2 AP; 1 for Doctor). Answer a pathogen quiz correctly to remove one infection and earn a research token.
   - **Prevent** an outbreak (2 AP; 1 for Nurse). A correct quiz answer places a shield that blocks one incoming infection.
   - **Share intel** with a teammate in the same region (1 AP). They get a bonus AP next turn (2 for Educator).
4. After everyone has played, two new infections appear. Shields absorb them when possible.
5. **Win** by earning 4 research tokens in each of the four pathogen categories.
6. **Lose** if three regions fall, or if the team runs out of time (12 rounds).

## Pathogens covered

- **Viruses:** Influenza, SARS-CoV-2, Norovirus
- **Bacteria:** Strep throat, E. coli, Tuberculosis
- **Fungi:** Athlete's foot, Ringworm, Candidiasis
- **Parasites:** Malaria, Giardiasis, Tapeworm

Every correct quiz response shows the pathogen's real prevention and treatment methods, so players learn while they play.

## Architecture

Single Node.js process, zero dependencies.

- **Transport:** Server-Sent Events (server → client) + HTTP POST (client → server). Reconnects automatically; sessions survive page reload via an `Accel` cookie.
- **Game engine:** Pure in-memory turn-based state, one game per 4-letter room code.
- **Client:** Vanilla HTML/CSS/JS. Works on phones and desktops.

## Files

```
server.js              Zero-dep HTTP server + SSE transport + game engine
public/index.html      Home / lobby / game view
public/styles.css
public/client.js
data/pathogens.json    Pathogen facts and quiz questions
```
