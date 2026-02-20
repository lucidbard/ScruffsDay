# Scruff's Day - Game Design Document

## Overview

**Title:** Scruff's Day
**Genre:** Point-and-click adventure with arcade mini-games
**Platform:** Mobile web (GitHub Pages)
**Target Audience:** Kids ages 8-12
**Play Time:** 20-30 minutes
**Theme:** Native plant conservation at Lyonia Preserve, Deltona, FL

A short adventure game inspired by Freddy Fish, starring a Florida scrub jay family at Lyonia Preserve. Players help restore the preserve's ecosystem by collecting native plant items and delivering them to animal friends. The game features Homestar Runner-inspired vector art and three distinct arcade mini-game sequences.

## Story

It's spring at Lyonia Preserve. Scruff, a young Florida scrub jay, discovers that invasive plants have been crowding out the native species that the preserve's animals depend on. The ecosystem is out of balance - animals can't find the food or shelter they need. Scruff decides to help by gathering native plant resources and delivering them to animal friends across the preserve, restoring each habitat zone one by one.

### Story Flow

1. Scruff discovers the problem at home (Scrub Thicket)
2. Helps Shelly the tortoise rebuild her burrow entrance
3. Meets Pip the mouse underground, gets a map
4. Helps Flicker the woodpecker clear invasive vines (Vine Buster mini-game)
5. Helps Sunny the snake restore sandy barrens (Seed Scatter mini-game)
6. Reports to Sage the owl at the overlook
7. Night Watch mini-game celebrates the restored preserve
8. Ending: The preserve is thriving again

## Characters

### Scruff (Florida Scrub Jay - Player Character)

- Oversized round head (~40% of body height), tiny body
- Huge expressive eyes with thick brows that shift with emotion
- Exaggerated blue crest that bounces when moving, flattens when sad, spikes up when excited
- Small stubby wings that flap in an exaggerated windmill motion when flying
- Legs are simple stick lines with big round feet (Homestar-style)
- **Animation states:** idle (gentle bob + crest sway), walking (bouncy waddle, crest bounces), flying (wings windmill, body tilts), talking (whole body squashes slightly on each syllable), picking up item (triumphant pose, crest stands tall)

### Shelly (Gopher Tortoise)

- Huge dome shell (~60% of total size) with exaggerated hexagonal plates
- Tiny head that pokes way out on a long neck, big droopy eyes (looks worried)
- Comically short stubby legs barely visible under the massive shell
- Shell has a slight wobble at all times, like it's barely balanced
- **Animation states:** idle (shell wobble, slow blink), talking (head bobs in and out of shell), happy (shell does a little spin), retreating (head pulls into shell with a pop)

### Pip (Florida Mouse)

- Tiny body, ENORMOUS round ears (~same size as head)
- Big sparkly eyes, always looks excited/nervous
- Comically long whiskers that extend past body width, twitch constantly
- Oversized fluffy tail that curls and uncurls
- **Animation states:** idle (ears twitch independently, whiskers wiggle), talking (bounces up and down in place), startled (ears go straight up, body freezes, whiskers splay), happy (does a little spin)

### Flicker (Red-bellied Woodpecker)

- Tall and lanky, exaggerated long neck
- Bright red cap that's comically oversized, like a beret
- Long pointy beak (~30% of body length), always slightly tilted
- Constantly tapping something - feet, branches, anything nearby
- **Animation states:** idle (pecking at nearby surface rhythmically), talking (head tilts side to side dramatically), working (rapid-fire pecking blur), excited (red cap feathers puff up)

### Sunny (Eastern Indigo Snake)

- Long sinuous body with an exaggerated S-curve, always in motion
- Friendly face with half-lidded sleepy eyes and a slight smile
- Iridescent blue-black body with exaggerated shimmer (simple 2-frame color shift)
- Wears the sandy ground patches like a blanket when cold (story beat)
- **Animation states:** idle (slow body wave, tongue flick), talking (raises head portion up, body sways), cold (coiled tight, shivering wobble), warm/happy (stretches out luxuriously, shimmer intensifies)

### Sage (Great Horned Owl)

- Massive round head with huge piercing yellow eyes
- Exaggerated ear tufts that express emotion (like eyebrows)
- Small compact body relative to the giant head
- Dignified posture but occasionally does something silly (one eye closes in a wink)
- **Animation states:** idle (slow head rotation, blink), talking (ear tufts animate with emphasis), listening (head tilts 90 degrees), impressed (both eyes go wide, tufts stand straight up)

## Game World

### Scene Map

```
                    [Owl's Overlook]
                         |
    [Pine Clearing] --- [Central Trail] --- [Sandy Barrens]
                         |
                    [Tortoise Burrow]
                         |
                    [Scrub Thicket]
```

### Scene Descriptions

**1. Scrub Thicket (Start)**
Scruff's home. Tutorial area where the player learns to tap-to-move and pick up items. A rusty lyonia bush is here. Scruff notices the invasive plants creeping in.

**2. Tortoise Burrow**
Shelly the gopher tortoise's home. Her burrow entrance is blocked by invasive Brazilian pepper. Give her saw palmetto fronds so she can rebuild her shelter properly. This unlocks the underground chamber where Pip the Florida mouse lives.

**3. Central Trail (Hub)**
Hub area connecting all locations. Has a signpost that acts as a mini-map for quick travel. Chapman oaks line the trail with collectible acorns. This is where Sage the owl gives guidance.

**4. Pine Clearing**
Flicker the woodpecker's sand pine is being strangled by invasive air potato vine. This triggers the Vine Buster arcade mini-game. After helping, Flicker gives you a feather.

**5. Sandy Barrens**
Sunny the indigo snake needs open sandy ground for basking. The area is overgrown. Deliver Florida rosemary cuttings to restore native ground cover. Triggers the Seed Scatter mini-game.

**6. Owl's Overlook (Finale)**
High point in the preserve. Sage the owl asks to see proof of your work. Present the story items from each NPC. Triggers the Night Watch celebration sequence showing the restored preserve.

### Navigation

- Tap anywhere on the ground to move Scruff
- Tap on objects/animals to interact
- Arrows at scene edges lead to adjacent scenes
- After reaching Central Trail, the signpost enables fast-travel to visited locations

## Collectible Items

### Native Plants (Key Items)

| Item | Found In | Given To | Purpose |
|------|----------|----------|---------|
| Saw palmetto fronds | Scrub Thicket | Shelly | Rebuild burrow entrance |
| Scrub hickory nuts | Central Trail | Pip | Food for the Florida mouse |
| Sand pine cones | Pine Clearing | Flicker's tree (story) | Part of the restoration |
| Florida rosemary cuttings | Sandy Barrens | Sunny | Ground cover for basking |
| Rusty lyonia flowers | Scrub Thicket | Sage (proof) | The preserve's namesake |
| Chapman oak acorns | Central Trail | Sage (proof) | Collected along the way |

### NPC Exchange Chain

| NPC | Needs | Gives Back |
|-----|-------|------------|
| Shelly (Tortoise) | Saw palmetto fronds | Access to underground (Pip) |
| Pip (Mouse) | Scrub hickory nuts | Map showing rare plant locations |
| Flicker (Woodpecker) | Help clearing vines (mini-game) | Feather (impresses Sunny) |
| Sunny (Snake) | Florida rosemary + planting (mini-game) | Clears path to Owl's Overlook |
| Sage (Owl) | Proof of restoration (all story items) | Final celebration |

## Arcade Mini-Games

### Mini-Game 1: "Vine Buster" (Pine Clearing)

**Type:** Tap/swipe action game
**Context:** Invasive air potato vines are wrapped around Flicker's sand pine.
**Gameplay:** Vines grow from screen edges toward the tree trunk. Tap vines to cut them before they reach the tree. They come in waves, getting faster. Some "trick" vines are actually native species (like native grape vine) - don't cut those! 30-second rounds, 3 rounds total.
**Educational hook:** Teaches players to distinguish invasive vs. native vines. Brief "Did you know?" popup between rounds.

### Mini-Game 2: "Seed Scatter" (Sandy Barrens)

**Type:** Aim-and-launch puzzle
**Context:** Scruff flies overhead with native plant seeds to restore bare ground.
**Gameplay:** Drag to aim, release to drop seeds from above. Wind gusts push seeds sideways. Land seeds on sandy patches (good) not on invasive patches (bad). Each native plant type has a different drop behavior - rosemary drops straight, palmetto seeds drift, oak acorns are heavy and fast.
**Educational hook:** Shows how different native plants colonize different soil conditions.

### Mini-Game 3: "Night Watch" (Owl's Overlook - bonus)

**Type:** Memory/observation game
**Context:** Sage the owl does a nighttime survey of the restored preserve.
**Gameplay:** Animals flash on screen in their habitats briefly. Player must tap them in the order they appeared. Rounds get longer. Features all the animals you've helped, now thriving in their restored habitats.
**Educational hook:** Reinforces which animals live in which habitats and ties the whole story together.

## Art Style

### Visual Direction (Homestar Runner-inspired)

- **Thick black outlines** on all characters and objects (3-4px stroke)
- **Bold, flat colors** - no gradients. Solid fills with occasional simple shading
- **Exaggerated proportions** - big heads, big eyes, simple bodies
- **Slightly wobbly lines** - hand-drawn feel, not sterile vector perfection
- **Clean, simple backgrounds** - stylized scrub landscape with geometric shapes suggesting plants

### Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Sky | Warm pale blue | `#87CEEB` |
| Sand/ground | Warm sandy tan | `#D2B48C` |
| Scrub jay blue | Bold blue | `#4169E1` |
| Vegetation (light) | Muted sage green | `#8FBC8F` |
| Vegetation (dark) | Forest green | `#2E8B57` |
| Accent | Rusty orange | `#CD853F` |
| UI background | Cream | `#FFF8DC` |
| UI text | Dark brown | `#3E2723` |

### Animation System

**Characters** are built from multiple SVG parts (head, body, limbs, features) positioned as PixiJS Containers. Animation is achieved by tweening the position/rotation/scale of individual parts, preserving vector art quality.

**Interactive element rule:** If you can tap it, it moves. If it doesn't move, you can't tap it.

- **Collectible items:** Gentle bounce loop (up-down 4px, 0.8s cycle) + subtle glow pulse. Bounce increases when Scruff approaches.
- **NPCs:** Always in idle animation. Become more energetic when Scruff is nearby.
- **Scene transitions:** Pulsing arrows at screen edges with wobble rotation.
- **Interactable scenery:** Exaggerated motion (bushes sway, flowers bob, water ripples).
- **Non-interactive scenery:** Static or very subtle parallax drift.

### UI Layout (Mobile)

```
+----------------------------+
|  [Scene Name]      [Menu]  |  <- top bar (small, semi-transparent)
|                            |
|                            |
|     Game Scene Area        |  <- main play area (tap to move/interact)
|     (SVG backgrounds,      |
|      characters, items)    |
|                            |
|                            |
+----------------------------+
| [item] [item] [item] [  ] |  <- inventory tray (bottom, draggable)
+----------------------------+
```

Dialogue appears as speech bubbles above characters - white bubble with black outline, text inside. Tap to advance.

## Technical Architecture

### Stack

- **PixiJS v8** - 2D WebGL renderer with canvas fallback
- **TypeScript** - Type safety without framework overhead
- **Vite** - Build tool, dev server, GitHub Pages deployment
- **GitHub Pages** - Static hosting from `gh-pages` branch

### Project Structure

```
src/
  main.ts              # Entry point, PixiJS app init
  game/
    GameState.ts        # Central state: inventory, flags, NPC progress
    SceneManager.ts     # Loads/unloads scenes, handles transitions
    DialogueSystem.ts   # Text bubbles, NPC conversation trees
    InventoryUI.ts      # Bottom-of-screen item tray
    InputManager.ts     # Touch/mouse tap handling, tap-to-move
  scenes/
    ScrubThicket.ts     # Scene 1 - tutorial/home
    TortoiseBurrow.ts   # Scene 2
    CentralTrail.ts     # Scene 3 - hub
    PineClearing.ts     # Scene 4
    SandyBarrens.ts     # Scene 5
    OwlsOverlook.ts     # Scene 6 - finale
  minigames/
    VineBuster.ts       # Tap-action vine cutting
    SeedScatter.ts      # Aim-and-launch planting
    NightWatch.ts       # Memory/observation
  characters/
    Scruff.ts           # Player character - movement, animation
    NPC.ts              # Base NPC class - dialogue, item exchange
  assets/
    characters/         # SVG character art
    backgrounds/        # SVG scene backgrounds
    items/              # SVG collectible items
    ui/                 # SVG UI elements
  data/
    dialogue.json       # All NPC dialogue trees
    scenes.json         # Scene definitions, connections, items
```

### Key Technical Decisions

- **Mobile-first responsive:** Game canvas scales to fit viewport, touch input primary
- **SVG to texture pipeline:** SVGs loaded and rasterized to PixiJS textures at device-appropriate resolution
- **Save state:** localStorage for mid-game saves (serialized GameState)
- **No audio initially:** Keeps scope manageable, can add later
- **Dialogue system:** JSON-driven conversation trees. NPC dialogue changes based on GameState flags
- **Minimum target:** 375px wide (iPhone SE)
- **Touch targets:** Minimum 44x44px
- **Orientation:** Landscape preferred, portrait supported
- **Asset loading:** Per-scene preloading to minimize memory on low-end devices

## Research Sources

- [Lyonia Preserve - Volusia County](https://www.volusia.org/services/community-services/resource-stewardship/land-management/conservation-lands-map/lyonia-preserve.stml)
- [Scrub Habitat and Species - Volusia County](https://www.volusia.org/services/growth-and-resource-management/environmental-management/sustainability-and-resilience/scrub-habitat-and-species/)
- [Florida Scrub-Jay - FWC](https://myfwc.com/wildlifehabitats/profiles/birds/songbirds/florida-scrub-jay/)
- [Florida Scrub - Wikipedia](https://en.wikipedia.org/wiki/Florida_scrub)
- [Sand Pine Scrub - FNPS](https://www.fnps.org/natives/native-plant-community/scrub)
