import 'package:buzz/features/dev_mode/author_colors.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('fnv1a32', () {
    test('empty string yields the FNV offset basis', () {
      expect(fnv1a32(''), 0x811c9dc5);
    });

    test('matches the desktop reference implementation', () {
      // Vectors computed with desktop's hashPubkey (Math.imul FNV-1a, >>> 0).
      expect(fnv1a32('alice'), 2267157479);
      expect(
        fnv1a32(
          '6d4fe6f510594d020a9bcbdf859541b71e203f6439a2610ae5c3928403668106',
        ),
        1227610665,
      );
      expect(
        fnv1a32(
          'c6741012416ef5c49a865db79682113385c5fb998e8c890234fb442b59e22748',
        ),
        4276836529,
      );
    });
  });

  group('devAuthorColor', () {
    test('picks the same palette slot as desktop for known pubkeys', () {
      // index = hash % 12, from the same reference vectors.
      expect(
        devAuthorColor(
          '6d4fe6f510594d020a9bcbdf859541b71e203f6439a2610ae5c3928403668106',
        ),
        devAuthorPalette[9],
      );
      expect(
        devAuthorColor(
          'c6741012416ef5c49a865db79682113385c5fb998e8c890234fb442b59e22748',
        ),
        devAuthorPalette[1],
      );
      expect(
        devAuthorColor(
          '1e2aa2c82938158763e74ff317edba3af88c22dbba39aad9a25cca84a24dcf3e',
        ),
        devAuthorPalette[5],
      );
      expect(devAuthorColor('alice'), devAuthorPalette[11]);
    });

    test('is deterministic and normalizes case and whitespace', () {
      const pubkey =
          'd48b404fa29858e0be428d477766e959d5c40309f7956c6874de347152add8b0';
      final color = devAuthorColor(pubkey);
      expect(devAuthorColor(pubkey), color);
      expect(devAuthorColor(pubkey.toUpperCase()), color);
      expect(devAuthorColor('  $pubkey '), color);
      expect(devAuthorPalette, contains(color));
    });

    test('palette has 12 entries', () {
      expect(devAuthorPalette, hasLength(12));
    });
  });
}
