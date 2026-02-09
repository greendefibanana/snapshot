# SNAPSHOT Game Lobby - Required Pages & Features

A comprehensive list of all pages, screens, buttons, and features the game lobby UI needs to support.

---

## 🎮 LOBBY PHASE SCREENS (Main Flow)

### 1. LobbyIdle - Mode Selection
| Feature | Description |
|---------|-------------|
| **Game Mode Cards** | 1v1 Duel, 4v4 Team Battle, Training |
| **Ruleset Badges** | Casual vs Wager modes |
| **Access Badges** | Public, Token-gated, NFT-gated, Friends-only |
| **SELECT Button** | Choose a mode and start queueing |

### 2. LobbyQueueing - Matchmaking
| Feature | Description |
|---------|-------------|
| **Search Status** | "Searching for Match..." animation |
| **Mode + Ruleset Display** | Shows selected mode and if it's wager |
| **Wait Timer** | MM:SS format countdown |
| **Players in Queue** | Optional stat showing queue population |
| **CANCEL Button** | Leave queue and return to idle |

### 3. LobbyAssembling - Team Formation
| Feature | Description |
|---------|-------------|
| **Player Slot Grid** | 8 slots (4v4), showing joined players |
| **Player Cards** | Avatar, name, "YOU" badge (local player), "HOST" badge |
| **Team Assignment** | Visual separation of Team 1 vs Team 2 |
| **Progress Indicator** | "Assembling players... X/8" |
| **Mode/Access Badges** | Shows current match settings |

### 4. LobbyReadyCheck - Pre-Game Confirmation
| Feature | Description |
|---------|-------------|
| **Player List** | All players with ready status (✓ READY / ○ WAITING) |
| **Ready Counter** | "X/Y players ready" |
| **CONFIRM READY Button** | Local player confirms they're ready |
| **Waiting Message** | Shown after local player confirms |

### 5. LobbyCountdown - Match Start
| Feature | Description |
|---------|-------------|
| **Large Countdown** | Big "3, 2, 1" display |
| **Teams Summary** | Team 1 vs Team 2 player lists |
| **VS Badge** | Visual separator between teams |
| **Mode Badge** | Shows match type |

### 6. LobbyError - Error Handling
| Feature | Description |
|---------|-------------|
| **Error Code** | Machine-readable error identifier |
| **Error Message** | Human-readable description |
| **Retry/Back Button** | Return to previous state |

---

## 👥 SOCIAL FEATURES

### Friends System
| Feature | Description |
|---------|-------------|
| **Friend List** | Display all accepted friends |
| **Send Friend Request** | Add new friend by player ID |
| **Accept/Decline Request** | Handle incoming friend requests |
| **Pending Requests** | View requests sent to you |
| **Block/Unblock Player** | Privacy controls |
| **Remove Friend** | Unfriend someone |
| **Rate Limits** | UI should show cooldowns (10 req/hour) |

### Lobby Invites
| Feature | Description |
|---------|-------------|
| **Send Invite** | Invite friend to your lobby |
| **Accept Invite** | Join friend's lobby |
| **Decline Invite** | Reject invitation |
| **Pending Invites List** | View all active invitations |
| **Invite Expiry** | 5-minute TTL indicator |

### Party System
| Feature | Description |
|---------|-------------|
| **Create Party** | Generate 6-character invite code |
| **Join by Code** | Enter code to join party |
| **Party Members Display** | Show all 1-4 members |
| **Leader Crown Icon** | Identify party leader |
| **Leave Party** | Exit current party |
| **Transfer Leadership** | Leader can promote another member |
| **Party Status** | idle / queuing / in_match |

---

## 📊 ORDER BOOK / WAGER MATCHMAKING

| Feature | Description |
|---------|-------------|
| **Create Bid Order** | "I want to challenge, wagering X" |
| **Create Ask Order** | "I accept challenges, min wager Y" |
| **Wager Amount Input** | Set your bet amount |
| **Min Opponent Wager** | Minimum you're willing to match against |
| **Order Book View** | List all open bids/asks |
| **Cancel Order** | Remove your order from book |
| **Order Expiry** | 10-minute TTL |
| **Match Notification** | When bid meets ask |

---

## 🎒 INVENTORY & LOADOUT

### Inventory Screen
| Feature | Description |
|---------|-------------|
| **Character Grid** | Owned characters display |
| **Weapon Grid** | Owned weapons display |
| **Cosmetic Grid** | Skins and cosmetics |
| **Equipped Indicators** | What's currently selected |
| **Item Selection** | Click to view details |
| **Item Details Panel** | Type, acquisition source, date acquired |

### Loadout Manager
| Feature | Description |
|---------|-------------|
| **Select Character** | Choose from owned characters |
| **Select Primary Weapon** | Choose main weapon |
| **Select Secondary Weapon** | Optional backup weapon |
| **Validation Errors** | "Not owned", "Duplicate weapon" warnings |
| **Reset to Default** | Revert to starter loadout |

---

## 🛒 STORE

| Feature | Description |
|---------|-------------|
| **Featured Item** | Prominent display of highlighted item |
| **Character Tab** | Buyable characters |
| **Weapon Tab** | Weapon skins/cosmetics |
| **Cosmetics Tab** | General cosmetic items |
| **Item Card** | Name, type, price, availability |
| **Limited/Sold Out Badges** | Scarcity indicators |
| **BUY Button** | Purchase flow (with wallet integration) |
| **Price Display** | Amount + currency ($SNAPSHOT) |

---

## ⚙️ SETTINGS & META

| Feature | Description |
|---------|-------------|
| **Player Stats Display** | Level badge, XP bar, Currency amount |
| **Region Selection** | NA-West, NA-East, EU-West, Asia |
| **Skill Rating Display** | MMR/ELO if ranked |
| **Connection Status** | Ping, server connection health |
| **Audio Settings** | Master, SFX, Music, Voice |
| **Video Settings** | Quality, resolution, fullscreen |
| **Controls Settings** | Keybindings, sensitivity |

---

## 🔔 NOTIFICATIONS & OVERLAYS

| Feature | Description |
|---------|-------------|
| **Match Found Popup** | Accept/Decline match (timeout ~10s) |
| **Invite Received Toast** | Friend invited you |
| **Friend Request Toast** | New friend request |
| **Party Join/Leave Notifications** | Member activity |
| **Error Toasts** | Network errors, validation failures |
| **Currency Earned Animation** | Post-match rewards |

---

## 📱 NAVIGATION STRUCTURE

```
Main Navigation Bar (always visible):
├── 🎮 PLAY (Lobby Screens)
├── 🎒 INVENTORY (Characters, Weapons, Cosmetics)
├── 🛒 STORE (Purchase items)
├── 👥 SOCIAL (Friends, Party)
├── ⚙️ SETTINGS
└── 💰 [Currency Display] $SNAPSHOT amount
```

---

## 🔌 WEB3 INTEGRATION FEATURES

| Feature | Description |
|---------|-------------|
| **Wallet Connect Button** | Connect Web3 wallet |
| **$SNAPSHOT Balance** | Real-time token balance |
| **NFT Character Display** | Show owned Character NFTs |
| **Skin NFT Display** | Weapon skin ownership |
| **Staking Interface** | Stake tokens for multipliers |
| **Transaction History** | Recent purchases/earnings |

---

## 🎯 IMPLEMENTATION CHECKLIST

### Must-Have Screens
- [ ] Mode Selection (Idle)
- [ ] Queue Status (Queueing)
- [ ] Team Assembly (Assembling)
- [ ] Ready Check
- [ ] Countdown
- [ ] Inventory
- [ ] Store
- [ ] Friends List
- [ ] Party Management
- [ ] Order Book (for wager matches)

### Key Interactive Elements
- [ ] Mode selection cards
- [ ] Queue/Cancel buttons
- [ ] Ready/Unready toggle
- [ ] Team switch (during assembly)
- [ ] Friend request send/accept/decline
- [ ] Party create/join/leave
- [ ] Inventory item selection/equip
- [ ] Store purchase flow
- [ ] Order book bid/ask creation
- [ ] Settings panels

### Visual Indicators Needed
- [ ] Player ready states
- [ ] Host/Leader badges
- [ ] Wager/Casual badges
- [ ] Access restriction badges (Token/NFT/Friends)
- [ ] Connection status
- [ ] Currency balance
- [ ] XP progress bar

---

## 📝 NOTES

This is a **hero shooter + Web3 economy** game. The lobby UI needs to seamlessly blend:
- Traditional multiplayer features (parties, matchmaking, loadouts)
- Blockchain elements (wallet, wagers, NFT inventory, token balance)

**Key Design Considerations:**
1. Keep the Web3 elements unobtrusive but accessible
2. Maintain fast, responsive UI for competitive players
3. Clear visual hierarchy for wager vs casual modes
4. Intuitive party management for team coordination
5. Real-time updates for order book and friend activity
