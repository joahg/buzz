import 'package:buzz/features/dev_mode/leading_mention.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const names = {
    'pk-amp': 'amp (local)',
    'pk-amp-short': 'amp',
    'pk-joah': 'joah',
  };

  group('extractLeadingMention', () {
    test('extracts a known leading mention and the remaining body', () {
      final mention = extractLeadingMention('@joah how does this look?', names);
      expect(mention?.pubkey, 'pk-joah');
      expect(mention?.name, 'joah');
      expect(mention?.body, 'how does this look?');
    });

    test('prefers the longest matching name', () {
      final mention = extractLeadingMention('@amp (local) open the PR', names);
      expect(mention?.pubkey, 'pk-amp');
      expect(mention?.name, 'amp (local)');
      expect(mention?.body, 'open the PR');
    });

    test('matches case-insensitively', () {
      final mention = extractLeadingMention('@Joah hi', names);
      expect(mention?.pubkey, 'pk-joah');
      expect(mention?.body, 'hi');
    });

    test('requires a word boundary after the name', () {
      expect(extractLeadingMention('@joahg hi', names), isNull);
    });

    test('handles a mention-only message with an empty body', () {
      final mention = extractLeadingMention('@joah', names);
      expect(mention?.pubkey, 'pk-joah');
      expect(mention?.body, isEmpty);
    });

    test('requires the @ to be the very first character (desktop parity)', () {
      expect(extractLeadingMention('  @joah hi', names), isNull);
    });

    test('accepts punctuation boundaries, leaving them in the body', () {
      final mention = extractLeadingMention('@joah, ship it', names);
      expect(mention?.pubkey, 'pk-joah');
      expect(mention?.body, ', ship it');

      final colon = extractLeadingMention('@joah: hi', names);
      expect(colon?.pubkey, 'pk-joah');
      expect(colon?.body, ': hi');
    });

    test('consumes only whitespace between the name and the body', () {
      final mention = extractLeadingMention('@joah   trailing spaces', names);
      expect(mention?.body, 'trailing spaces');
    });

    test('returns null when the message does not start with @', () {
      expect(extractLeadingMention('hello @joah', names), isNull);
      expect(extractLeadingMention('', names), isNull);
    });

    test('returns null for unknown names', () {
      expect(extractLeadingMention('@stranger hi', names), isNull);
      expect(extractLeadingMention('@joah hi', const {}), isNull);
    });
  });
}
