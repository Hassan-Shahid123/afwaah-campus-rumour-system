# Afwaah — Frontend Development Guide

> **For teammates building the GUI.** The backend is done — this guide shows you how to build the user interface on top of it.

---

## 1. Recommended Tech Stack

The frontend lives in `frontend/`. We recommend:

| Technology | Purpose | Why |
|-----------|---------|-----|
| **React 18+** | UI framework | Component-based, huge ecosystem |
| **Vite** | Build tool | Fast HMR, ES module native |
| **Tailwind CSS** | Styling | Utility-first, fast to prototype |
| **React Router** | Navigation | Multi-page SPA routing |
| **Zustand** or **Context API** | State management | Lightweight, no boilerplate |

### Initialize the Frontend

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom tailwindcss @tailwindcss/vite
```

Then modify `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

---

## 2. Pages to Build

The app has **5 main pages**:

```
/                 → Landing / Join page
/feed             → Rumor feed (main view)
/post             → Create new rumor
/vote/:rumorId    → Vote on a specific rumor
/profile          → Your reputation & history
```

### Page 1: Join / Onboarding (`/`)

**What happens:**
1. User uploads their `.eml` email file (downloaded from university inbox)
2. Backend verifies the DKIM signature + domain
3. Backend creates a Semaphore anonymous identity
4. Identity commitment is added to the membership tree
5. User gets a "You're anonymous now" confirmation

**Backend calls:**
```javascript
import { EmailVerifier } from '../backend/src/identity/email-verifier.js';
import { IdentityManager } from '../backend/src/identity/identity-manager.js';
import { MembershipTree } from '../backend/src/identity/membership-tree.js';

// 1. Verify email
const verifier = new EmailVerifier();
const result = verifier.verifyEmail(emlFileContent);
// result = { domain: 'university.edu', isValid: true, hasDKIM: true, ... }

// 2. Create anonymous identity
const identity = IdentityManager.create();
// identity.commitment → bigint (public identifier)
// identity is secret — NEVER send it over the network

// 3. Add to membership tree
const tree = new MembershipTree();
const index = tree.addMember(identity.commitment);

// 4. Store identity locally (browser localStorage or IndexedDB)
const exported = IdentityManager.exportIdentity(identity);
localStorage.setItem('afwaah-identity', exported);
```

**UI elements:**
- File upload dropzone for `.eml`
- Progress steps: "Verifying email..." → "Creating identity..." → "Joining network..."
- Success screen with anonymous avatar (derived from commitment hash)
- "Your identity is stored locally and never leaves this device" message

---

### Page 2: Rumor Feed (`/feed`)

**What happens:**
1. Load all rumors from local OrbitDB store
2. Listen for real-time new rumors via gossipsub
3. Display each rumor with its trust score, vote count, and status

**Backend calls:**
```javascript
import { StoreManager } from '../backend/src/storage/stores.js';

// Get all rumors (most recent first)
const rumors = await storeManager.getAllRumors();
// Returns: [{ hash, value: { text, topic, zkProof, timestamp, ... } }]

// Listen for new rumors arriving from network
storeManager.onUpdate('rumors', (entry) => {
  // Add new rumor to the feed in real-time
});
```

**UI elements:**
- Card-based feed (like Twitter/Reddit)
- Each card shows:
  - Rumor text
  - Topic badge (🏛 Administration, 🔒 Safety, 🎉 Events, 📚 Academic, 🏗 Facilities, 💬 General)
  - Trust score bar (0-100, color-coded: red → yellow → green)
  - Vote count
  - Time ago
  - "Vote" button
- Filter by topic
- Sort by: newest, most voted, highest trust, most disputed
- Pull-to-refresh or auto-refresh

**Trust Score Color Coding:**
```
0-30    → 🔴 Red     → "Likely False"
30-50   → 🟡 Yellow  → "Disputed"
50-70   → 🟢 Light   → "Leaning True"
70-100  → 🟢 Green   → "Strongly True"
```

---

### Page 3: Post Rumor (`/post`)

**What happens:**
1. User types the rumor text
2. Selects a topic category
3. Backend generates a ZK proof (proves membership without revealing identity)
4. Rumor is broadcast to the network via gossipsub

**Backend calls:**
```javascript
import { GossipController } from '../backend/src/network/gossip-controller.js';
import { PROTOCOL } from '../backend/src/config.js';

// The ZK proof generation (Semaphore)
// import { generateProof } from '@semaphore-protocol/proof';
// const proof = await generateProof(identity, group, message, scope);

// Publish
await gossipController.publishRumor({
  id: generatedCID,
  text: 'The Dean is cancelling Friday classes',
  topic: 'administration',
  zkProof: {
    proof: base64EncodedProof,
    merkleRoot: tree.getRoot().toString(),
    nullifierHash: proof.nullifier.toString(),
    externalNullifier: scopeHash.toString(),
  },
});
```

**UI elements:**
- Text area (max 2000 chars) with character counter
- Topic dropdown (6 categories)
- "Post Anonymously" button (big, reassuring)
- "Generating ZK proof..." loading spinner (can take a few seconds)
- Confirmation: "Your rumor is live. You cannot be identified."
- Reputation stake indicator: "This will stake 5 of your 10 reputation points"

---

### Page 4: Vote on Rumor (`/vote/:rumorId`)

**What happens:**
1. Show the rumor text + current stats
2. User answers TWO questions (this is the BTS dual-question):
   - **Q1:** "Do you believe this is TRUE, FALSE, or UNVERIFIED?"
   - **Q2:** "What percentage of other students do you think will answer TRUE / FALSE / UNVERIFIED?"
3. User decides how much reputation to stake
4. Backend generates ZK proof + publishes vote

**Backend calls:**
```javascript
await gossipController.publishVote({
  rumorId: 'QmRumorCID...',
  vote: 'TRUE',                              // Q1 answer
  prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 },  // Q2 answer
  stakeAmount: 5,
  zkProof: { ... },
});
```

**UI elements:**
- Rumor card at the top (same as feed card)
- **Question 1:** Three big buttons — ✅ TRUE / ❌ FALSE / ❓ UNVERIFIED
- **Question 2:** Three sliders that must sum to 100%
  - "What % will say TRUE?" [slider]
  - "What % will say FALSE?" [slider]
  - "What % will say UNVERIFIED?" [auto-calculated to reach 100%]
- Stake selector: slider from 1 to max (25% of reputation)
- "Submit Vote" button
- Explainer text: *"BTS rewards honest answers. Your best strategy is to answer truthfully."*

---

### Page 5: Profile (`/profile`)

**What happens:**
1. Show user's reputation score
2. Show vote history + BTS scores earned
3. Show staking status (locked stakes on pending rumors)

**Backend calls:**
```javascript
// Get reputation
const rep = await storeManager.getReputation(myNullifierId);
// { score: 15.5, history: [{action: 'reward', delta: 2}, ...], lastUpdated: ... }

// Get my votes
const allVotes = await storeManager.getAllVotes();
const myVotes = allVotes.filter(v => v.value.zkProof.nullifierHash === myNullifier);
```

**UI elements:**
- Big reputation score number (with trend arrow ↑↓)
- Score bar (0 to 1000, showing current position)
- History list: "Voted TRUE on 'Library closing early' → +2.3 reputation"
- Active stakes section
- Anonymous avatar (derived from commitment, same as join page)
- "Export Identity" button (backup for moving to another device)

---

## 3. Connecting Frontend to Backend

The backend modules run **in the same process** as the frontend (this is P2P — no API calls to a server). You import them directly.

### Option A: Electron (Desktop App)

The easiest path. Both frontend (React) and backend (Node.js) run in the same Electron process.

```bash
npm install electron electron-builder --save-dev
```

### Option B: Browser with Web Workers

Run the backend in a Web Worker. Use `comlink` for communication.

```bash
npm install comlink
```

### Option C: Separate Process (Development)

During development, run the backend as a local Node.js service and the frontend talks to it via localhost HTTP/WebSocket. 

```javascript
// backend/src/index.js — simple HTTP bridge for dev
import express from 'express';
const app = express();
app.get('/api/rumors', async (req, res) => {
  const rumors = await storeManager.getAllRumors();
  res.json(rumors);
});
app.listen(3001);
```

**Recommendation: Start with Option C for rapid development, then package as Electron later.**

---

## 4. State Management

The frontend needs to track:

```javascript
const appState = {
  // Identity (persisted in localStorage)
  identity: null,         // Semaphore Identity object
  commitment: null,       // bigint public ID
  isJoined: false,

  // Network
  node: null,             // AfwaahNode instance
  peers: [],              // connected peer count
  isOnline: false,

  // Data
  rumors: [],             // sorted list of rumors
  votes: {},              // rumorId → votes[]
  myVotes: new Set(),     // rumorIds I've voted on
  
  // Reputation
  reputation: 10,         // current score
  history: [],            // action log
};
```

### Suggested Zustand Store

```javascript
import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Identity
  identity: null,
  setIdentity: (id) => set({ identity: id }),
  
  // Rumors
  rumors: [],
  addRumor: (rumor) => set((s) => ({ rumors: [rumor, ...s.rumors] })),
  
  // Reputation  
  reputation: 10,
  updateReputation: (delta) => set((s) => ({ reputation: s.reputation + delta })),
}));
```

---

## 5. Design Guidelines

### Visual Identity

- **Name:** Afwaah (Urdu for "rumor")
- **Mood:** Modern, anonymous, trustworthy
- **Color palette:**
  - Primary: `#6366F1` (Indigo)
  - Trust Green: `#22C55E`
  - Warning Yellow: `#EAB308`
  - Danger Red: `#EF4444`
  - Background: `#0F172A` (dark) / `#F8FAFC` (light)
- **Font:** Inter or system-ui

### Anonymity UX Patterns

- **Never show real names** — use anonymous avatars derived from identity commitment
- **Use "You" not "User123"** — everyone is anonymous, first person only
- **Prominent privacy badges** — "Anonymous" label on every post
- **ZK proof loading state** — show "Generating proof..." to explain delays
- **"Identity stored locally" reminder** — on every important action

### Responsive Design

- **Mobile-first** — most students will use phones
- **PWA-ready** — add `manifest.json` + service worker for installability
- **Offline support** — show cached data when network is unavailable (OrbitDB handles sync on reconnect)

---

## 6. Component Checklist

Here's every component to build, roughly in priority order:

### Must Have (MVP)
- [ ] `<JoinPage />` — email upload + identity creation
- [ ] `<FeedPage />` — rumor list with trust scores
- [ ] `<RumorCard />` — single rumor display
- [ ] `<PostPage />` — create new rumor
- [ ] `<VotePage />` — dual BTS question UI
- [ ] `<ProfilePage />` — reputation + history
- [ ] `<TrustBar />` — 0-100 color-coded bar
- [ ] `<TopicBadge />` — category label
- [ ] `<Layout />` — nav bar + routing

### Nice to Have
- [ ] `<PeerIndicator />` — show connected peer count
- [ ] `<ProofLoader />` — ZK proof generation progress
- [ ] `<StakeSlider />` — reputation stake selector
- [ ] `<PredictionSliders />` — three sliders that sum to 100%
- [ ] `<NotificationToast />` — "New rumor received" alerts
- [ ] `<FilterBar />` — topic + sort filters
- [ ] `<ExportIdentity />` — backup/restore identity
- [ ] Dark mode toggle

---

## 7. Testing the Frontend

```bash
cd frontend
npm run dev    # Start Vite dev server (hot reload)
npm run build  # Production build
npm run test   # Run component tests (if using Vitest)
```

### Manual Testing Checklist

1. [ ] Can upload `.eml` and see "Identity Created" 
2. [ ] Can see rumor feed with mock data
3. [ ] Can post a new rumor (appears in feed)
4. [ ] Can vote on a rumor (both questions work)
5. [ ] Can see reputation change after scoring
6. [ ] Trust score colors are correct
7. [ ] Works on mobile viewport
8. [ ] Anonymous — no personal info visible anywhere

---

## 8. Quick Reference: Backend API Cheatsheet

```javascript
// ── Identity ──────────────────────────────
import { EmailVerifier } from 'backend/src/identity/email-verifier.js';
import { IdentityManager } from 'backend/src/identity/identity-manager.js';
import { MembershipTree } from 'backend/src/identity/membership-tree.js';

const verifier = new EmailVerifier();
const result = verifier.verifyEmail(emlString);     // { domain, isValid, hasDKIM }

const id = IdentityManager.create();                // Semaphore Identity
const exported = IdentityManager.exportIdentity(id); // base64 string
const restored = IdentityManager.importIdentity(exported);

const tree = new MembershipTree();
tree.addMember(id.commitment);                      // returns index
tree.generateMerkleProof(index);                    // returns proof object

// ── Network ───────────────────────────────
import { AfwaahNode } from 'backend/src/network/node.js';
import { GossipController } from 'backend/src/network/gossip-controller.js';

const node = new AfwaahNode();
await node.start();
const gossip = new GossipController(node);
gossip.start();

gossip.onRumor((parsed) => { /* new rumor arrived */ });
gossip.onVote((parsed) => { /* new vote arrived */ });
await gossip.publishRumor({ text, topic, zkProof });
await gossip.publishVote({ rumorId, vote, prediction, stakeAmount, zkProof });

// ── Storage ───────────────────────────────
import { DatabaseManager } from 'backend/src/storage/db.js';
import { StoreManager } from 'backend/src/storage/stores.js';

const db = new DatabaseManager();
await db.start({ libp2p: node.libp2p });
const stores = new StoreManager(db.getOrbitDB());
await stores.open();

await stores.addRumor({ text, topic, zkProof });
const rumors = await stores.getAllRumors();
const votes = await stores.getVotesForRumor(rumorId);
const rep = await stores.getReputation(nullifierId);

// ── Scoring ───────────────────────────────
import { BTSEngine } from 'backend/src/scoring/bts-engine.js';
import { ReputationManager } from 'backend/src/scoring/reputation-manager.js';
import { CorrelationDampener } from 'backend/src/scoring/correlation-dampener.js';

const dampener = new CorrelationDampener();
const dampenedVotes = dampener.dampen(votes, voteHistory);

const bts = new BTSEngine();
const result = bts.calculate(dampenedVotes);
// { rumorTrustScore, voterScores, consensus, actualProportions }

const repMgr = new ReputationManager();
repMgr.applyScores(result, rumorId, storeManager);
```

---

## Happy coding! 🚀

If you're stuck, read the tests in `backend/tests/` — they show exactly how every function is called. The tests are the best documentation.
