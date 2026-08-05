import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/dev_mode/channel_family.dart';
import 'package:flutter_test/flutter_test.dart';

Channel _channel(String name, {DateTime? lastMessageAt}) => Channel(
  id: 'id-$name',
  name: name,
  channelType: 'stream',
  visibility: 'open',
  description: '',
  createdBy: 'creator',
  createdAt: DateTime(2026, 1, 1),
  memberCount: 1,
  lastMessageAt: lastMessageAt,
  isMember: true,
);

void main() {
  group('subChannelParentName', () {
    test('extracts the parent from a one-level sub name', () {
      expect(subChannelParentName('buzz-dev-mode--releases'), 'buzz-dev-mode');
    });

    test('returns null without a separator or with a degenerate one', () {
      expect(subChannelParentName('general'), isNull);
      expect(subChannelParentName('--sub'), isNull);
      expect(subChannelParentName('parent--'), isNull);
    });

    test('splits at the first separator only (one nesting level)', () {
      expect(subChannelParentName('a--b--c'), 'a');
    });
  });

  group('subChannelLabel', () {
    test('returns everything after the first separator', () {
      expect(subChannelLabel('buzz-dev-mode--releases'), 'releases');
      expect(subChannelLabel('a--b--c'), 'b--c');
    });

    test('returns the full name when not a sub name', () {
      expect(subChannelLabel('general'), 'general');
      expect(subChannelLabel('parent--'), 'parent--');
    });
  });

  group('buildChannelFamilies', () {
    test('groups subs under their existing parent', () {
      final parent = _channel(
        'code-review',
        lastMessageAt: DateTime(2026, 8, 1),
      );
      final sub = _channel(
        'code-review--new-sub',
        lastMessageAt: DateTime(2026, 8, 2),
      );
      final other = _channel('general', lastMessageAt: DateTime(2026, 7, 1));

      final families = buildChannelFamilies([other, sub, parent]);

      expect(families, hasLength(2));
      expect(families.first.parent.name, 'code-review');
      expect(families.first.subs.map((c) => c.name), ['code-review--new-sub']);
      expect(families.last.parent.name, 'general');
    });

    test('an orphan sub-named channel stays a main row', () {
      final orphan = _channel('missing--sub');
      final families = buildChannelFamilies([orphan]);

      expect(families, hasLength(1));
      expect(families.single.parent.name, 'missing--sub');
      expect(families.single.subs, isEmpty);
    });

    test('sorts families by newest activity anywhere in the family', () {
      final quietParent = _channel(
        'quiet',
        lastMessageAt: DateTime(2026, 8, 1),
      );
      final busyParent = _channel('busy', lastMessageAt: DateTime(2026, 7, 1));
      final busySub = _channel(
        'busy--work',
        lastMessageAt: DateTime(2026, 8, 3),
      );

      final families = buildChannelFamilies([quietParent, busyParent, busySub]);

      expect(families.map((f) => f.parent.name), ['busy', 'quiet']);
    });

    test('sorts subs newest first, then by name', () {
      final parent = _channel('p');
      final older = _channel('p--older', lastMessageAt: DateTime(2026, 8, 1));
      final newer = _channel('p--newer', lastMessageAt: DateTime(2026, 8, 2));
      final a = _channel('p--a');
      final b = _channel('p--b');

      final families = buildChannelFamilies([parent, a, older, b, newer]);

      expect(families.single.subs.map((c) => c.name), [
        'p--newer',
        'p--older',
        'p--a',
        'p--b',
      ]);
    });

    test('lastActivity is the newest across parent and subs', () {
      final parent = _channel('p', lastMessageAt: DateTime(2026, 8, 5));
      final sub = _channel('p--s', lastMessageAt: DateTime(2026, 8, 2));

      final family = buildChannelFamilies([parent, sub]).single;

      expect(family.lastActivity, DateTime(2026, 8, 5));
      expect(family.members.map((c) => c.name), ['p', 'p--s']);
    });
  });

  group('devRelativeTime', () {
    final now = DateTime(2026, 8, 5, 12, 0);

    test('formats compact ages', () {
      expect(
        devRelativeTime(now.subtract(const Duration(seconds: 30)), now: now),
        'now',
      );
      expect(
        devRelativeTime(now.subtract(const Duration(minutes: 5)), now: now),
        '5m',
      );
      expect(
        devRelativeTime(now.subtract(const Duration(hours: 3)), now: now),
        '3h',
      );
      expect(
        devRelativeTime(now.subtract(const Duration(days: 2)), now: now),
        '2d',
      );
    });
  });
}
