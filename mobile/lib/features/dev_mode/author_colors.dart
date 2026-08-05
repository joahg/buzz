import 'dart:ui';

/// Deterministic per-author colors, ported verbatim from desktop dev mode
/// (`desktop/src/features/dev-mode/lib/authorColors.ts`): the same pubkey
/// renders the same color on both clients.
const devAuthorPalette = <Color>[
  Color(0xFFE5484D), // red
  Color(0xFFF76B15), // orange
  Color(0xFFFFB224), // amber
  Color(0xFF46A758), // green
  Color(0xFF12A594), // teal
  Color(0xFF0091FF), // blue
  Color(0xFF3E63DD), // indigo
  Color(0xFF6E56CF), // violet
  Color(0xFF8E4EC6), // purple
  Color(0xFFE93D82), // pink
  Color(0xFF05A2C2), // cyan
  Color(0xFF978365), // bronze
];

/// 32-bit FNV-1a over the string's UTF-16 code units, matching the desktop
/// implementation (`hash ^= charCode; hash = Math.imul(hash, 0x01000193)`).
int fnv1a32(String input) {
  var hash = 0x811c9dc5;
  for (final codeUnit in input.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash;
}

Color devAuthorColor(String pubkey) {
  final normalized = pubkey.trim().toLowerCase();
  return devAuthorPalette[fnv1a32(normalized) % devAuthorPalette.length];
}
