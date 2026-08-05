import 'package:flutter/foundation.dart';

/// A leading directed mention split out of a message body, mirroring desktop
/// dev mode's header treatment: `@amp (local) open the PR` renders as
/// `Author  to amp (local)` with body `open the PR`.
@immutable
class LeadingMention {
  final String pubkey;
  final String name;
  final String body;

  const LeadingMention({
    required this.pubkey,
    required this.name,
    required this.body,
  });
}

/// Same boundary the desktop composer's mention-prefix check uses
/// (`MENTION_BOUNDARY_RE` in desktop's highlightContent.tsx).
final RegExp _mentionBoundary = RegExp(r'[\s,.;:!?)\]]');

/// Extract a known leading `@Name` from [content], mirroring desktop's
/// `matchLeadingMention`: the `@` must be the very first character, matching
/// is case-insensitive, the longest known name wins (`@amp (local)` over
/// `@amp`), and the name must end at end-of-message, whitespace, or
/// punctuation. Only trailing whitespace is consumed into the header —
/// trailing punctuation stays in the body. [mentionNames] maps normalized
/// pubkeys to display names. Returns null when the message doesn't start
/// with a known mention.
LeadingMention? extractLeadingMention(
  String content,
  Map<String, String> mentionNames,
) {
  if (!content.startsWith('@')) return null;

  final rest = content.substring(1);
  final restLower = rest.toLowerCase();

  final candidates = mentionNames.entries.toList()
    ..sort((a, b) => b.value.length.compareTo(a.value.length));

  for (final entry in candidates) {
    final name = entry.value;
    if (name.isEmpty) continue;
    if (!restLower.startsWith(name.toLowerCase())) continue;

    final after = rest.substring(name.length);
    if (after.isNotEmpty && !_mentionBoundary.hasMatch(after[0])) continue;

    final body = after.replaceFirst(RegExp(r'^\s+'), '');
    return LeadingMention(pubkey: entry.key, name: name, body: body);
  }
  return null;
}
