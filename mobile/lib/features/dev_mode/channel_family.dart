import 'package:flutter/foundation.dart';

import '../channels/channel.dart';

/// Parent/sub channel grouping by the `parent--sub` naming convention,
/// mirroring desktop dev mode (`desktop/src/features/dev-mode/lib/subChannels.ts`):
/// exactly one nesting level, and a channel is a sub only when a channel with
/// the exact parent name exists — an orphan `foo--bar` stays a main row.
@immutable
class ChannelFamily {
  final Channel parent;

  /// Sub-channels, newest activity first, then by name.
  final List<Channel> subs;

  const ChannelFamily({required this.parent, this.subs = const []});

  /// Newest activity across the whole family.
  DateTime? get lastActivity {
    DateTime? latest = parent.lastMessageAt;
    for (final sub in subs) {
      final at = sub.lastMessageAt;
      if (at != null && (latest == null || at.isAfter(latest))) {
        latest = at;
      }
    }
    return latest;
  }

  List<Channel> get members => [parent, ...subs];
}

/// The parent name encoded in [name], or null when the name has no `--`
/// separator (or a degenerate one, like a leading/trailing separator).
String? subChannelParentName(String name) {
  final index = name.indexOf('--');
  if (index <= 0) return null;
  if (index + 2 >= name.length) return null;
  return name.substring(0, index);
}

/// The sub label shown for a sub-channel: everything after the first `--`.
String subChannelLabel(String name) {
  final index = name.indexOf('--');
  if (index <= 0 || index + 2 >= name.length) return name;
  return name.substring(index + 2);
}

/// Group [channels] into families, ordered by family last activity
/// (newest first). Channels whose parent doesn't exist in [channels] become
/// their own single-member family.
List<ChannelFamily> buildChannelFamilies(List<Channel> channels) {
  final byName = <String, Channel>{
    for (final channel in channels) channel.name: channel,
  };

  int byActivityThenName(Channel a, Channel b) {
    final aAt = a.lastMessageAt?.millisecondsSinceEpoch ?? 0;
    final bAt = b.lastMessageAt?.millisecondsSinceEpoch ?? 0;
    if (aAt != bAt) return bAt.compareTo(aAt);
    return a.name.compareTo(b.name);
  }

  final subsByParent = <String, List<Channel>>{};
  final parents = <Channel>[];
  for (final channel in channels) {
    final parentName = subChannelParentName(channel.name);
    if (parentName != null && byName.containsKey(parentName)) {
      subsByParent.putIfAbsent(parentName, () => []).add(channel);
    } else {
      parents.add(channel);
    }
  }

  final families = [
    for (final parent in parents)
      ChannelFamily(
        parent: parent,
        subs: [...?subsByParent[parent.name]]..sort(byActivityThenName),
      ),
  ];

  families.sort((a, b) {
    final aAt = a.lastActivity?.millisecondsSinceEpoch ?? 0;
    final bAt = b.lastActivity?.millisecondsSinceEpoch ?? 0;
    if (aAt != bAt) return bAt.compareTo(aAt);
    return a.parent.name.compareTo(b.parent.name);
  });
  return families;
}

/// Compact dev-mode activity age: `now`, `Nm`, `Nh`, or `Nd`.
String devRelativeTime(DateTime time, {@visibleForTesting DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  return '${diff.inDays}d';
}
