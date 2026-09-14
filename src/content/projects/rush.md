---
title: RUSH
date: 2026-09-13
summary: a first-person arena shooter on roblox, written in luau.
tags:
  - roblox
  - luau
  - fps
draft: false
status: shipped
url: https://www.roblox.com/games/120175057573184/RUSH
cover: /projects/rush/cover.webp
splash: /projects/rush/splash.webp
---

one roblox place hosting four kinds of server, decided from the first
arrival's teleport data. a public warzone rotation running free for all, team
deathmatch and gun game. an eight-player ranked mode with three lives, chests
and shields, played on a reserved server reached from a queue. one-versus-one
duels, best of five, full loadout. and private matches on the host's own
settings.

## what it took

the build split the original arena in two. warzone keeps the public rotation
and hands you a loadout from spawn, no chests. ranked keeps the entire chest
loop behind a queue and gives you finite lives. on top of that came a shield
layer, gun rarity variants, a bloom-based accuracy model, an in-game menu and
a competitive ladder.

around fifty-four luau files, no rojo. every script is pasted into studio by
hand, which is a constraint that shapes the whole codebase: `require` and
`WaitForChild` are case-sensitive, and a wrong name doesn't error, it hangs.

## engine traps worth keeping

luau has a two-hundred-local ceiling. cross it and the script silently does
not exist, then blames an innocent variable four hundred lines away.

a property every writer sets to the same value has no owner. the mouse cursor
had three writers and all three wrote `true`, so it had never once been turned
off.

a chain of small rotated frames is not a curve. the fix is a real circle, not
more segments.

## recent work

matchmaking that pairs on mmr with one bracket queue per division, widening at
fifteen seconds. a bot overhaul spanning fourteen modules — perception, aim,
navigation, tactics and team coordination. and a reticle pass: six per-class
crosshairs with the magazine drawn as a quarter arc that fades five seconds
after the last shot.
