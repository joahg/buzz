part of '../channel_detail_page.dart';

/// Dev-mode transcript row, mirroring desktop's `DevMessageRow`: no avatar,
/// compact monospace header (author in a deterministic color, optional
/// "to Name" for a leading directed mention on a human message, time,
/// edited marker), and a left accent bar in the author's color on human
/// messages so they stay scannable in agent-heavy channels.
class _DevMessageRow extends ConsumerWidget {
  final TimelineMessage message;
  final String displayName;
  final bool isHuman;
  final bool canManageMessage;
  final Map<String, String> mentionNames;
  final Set<String> agentMentionPubkeys;
  final Map<String, String> channelNames;
  final String currentChannelId;
  final String? currentPubkey;
  final List<TimelineMessage>? allMessages;
  final bool isMember;
  final bool isArchived;

  const _DevMessageRow({
    required this.message,
    required this.displayName,
    required this.isHuman,
    required this.canManageMessage,
    required this.mentionNames,
    required this.agentMentionPubkeys,
    required this.channelNames,
    required this.currentChannelId,
    required this.currentPubkey,
    required this.allMessages,
    required this.isMember,
    required this.isArchived,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pk = message.pubkey.toLowerCase();
    final authorColor = devAuthorColor(pk);
    final isSelf = currentPubkey?.toLowerCase() == pk;

    // A leading `@Name` mention on a human message is direction, not prose:
    // lift it into the header as "to Name" and drop it from the body. Agent
    // replies keep their mentions inline as normal text (desktop parity).
    final directed = isHuman
        ? extractLeadingMention(message.content, mentionNames)
        : null;
    final bodyContent = directed?.body ?? message.content;
    final mutedColor = context.colors.onSurfaceVariant;

    void openThread() {
      final messages = allMessages;
      if (messages == null || !context.mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ThreadDetailPage(
            threadHead: message,
            allMessages: messages,
            channelId: currentChannelId,
            currentPubkey: currentPubkey,
            isMember: isMember,
            isArchived: isArchived,
          ),
        ),
      );
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey('dev-message-row-${message.id}'),
        highlightColor: context.colors.primary.withValues(alpha: 0.1),
        onTap: allMessages == null ? null : openThread,
        onLongPress: () => showMessageActions(
          context: context,
          ref: ref,
          message: message,
          channelId: currentChannelId,
          canManageMessage: canManageMessage,
          allMessages: allMessages,
          currentPubkey: currentPubkey,
          isMember: isMember,
          isArchived: isArchived,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Grid.quarter),
          child: Container(
            decoration: isHuman
                ? BoxDecoration(
                    border: Border(
                      left: BorderSide(color: authorColor, width: 2),
                    ),
                  )
                : null,
            padding: EdgeInsets.only(left: isHuman ? Grid.xxs : 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Flexible(
                      child: GestureDetector(
                        onTap: () =>
                            showUserProfileSheet(context, message.pubkey),
                        child: Text(
                          displayName,
                          key: ValueKey('dev-message-author-${message.id}'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'GeistMono',
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: authorColor,
                            decoration: isSelf
                                ? TextDecoration.underline
                                : null,
                            decorationStyle: isSelf
                                ? TextDecorationStyle.dotted
                                : null,
                            decorationColor: authorColor,
                          ),
                        ),
                      ),
                    ),
                    if (directed != null) ...[
                      const SizedBox(width: Grid.half),
                      Flexible(
                        child: Text.rich(
                          TextSpan(
                            text: 'to ',
                            style: TextStyle(
                              fontFamily: 'GeistMono',
                              fontSize: 11,
                              color: mutedColor.withValues(alpha: 0.6),
                            ),
                            children: [
                              TextSpan(
                                text: directed.name,
                                style: TextStyle(
                                  color: devAuthorColor(directed.pubkey),
                                ),
                              ),
                            ],
                          ),
                          key: ValueKey('dev-message-directed-${message.id}'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                    const SizedBox(width: Grid.half),
                    Text(
                      formatMessageTime(message.createdAt),
                      key: ValueKey('dev-message-timestamp-${message.id}'),
                      style: TextStyle(
                        fontFamily: 'GeistMono',
                        fontSize: 11,
                        color: mutedColor.withValues(alpha: 0.5),
                      ),
                    ),
                    if (message.edited) ...[
                      const SizedBox(width: Grid.half),
                      Text(
                        '(edited)',
                        style: TextStyle(
                          fontFamily: 'GeistMono',
                          fontSize: 11,
                          color: mutedColor.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ],
                ),
                if (bodyContent.trim().isNotEmpty || message.hasAttachments)
                  MessageContent(
                    content: bodyContent,
                    mentionNames: mentionNames,
                    agentMentionPubkeys: agentMentionPubkeys,
                    channelNames: channelNames,
                    tags: message.tags,
                    baseStyle: messageBodyTextStyle.copyWith(
                      fontFamily: 'GeistMono',
                      fontSize: 13,
                      color: context.colors.onSurface,
                    ),
                    scaleEmojiOnly: true,
                    mediaCarouselTrailingOverflow: Grid.gutter,
                    onMediaReply: allMessages == null ? null : openThread,
                    onMediaMore: (viewerContext, imageUrl) => showImageActions(
                      context: viewerContext,
                      ref: ref,
                      message: message,
                      channelId: currentChannelId,
                      imageUrl: imageUrl,
                      canManageMessage: canManageMessage,
                      onDeleted: () {
                        if (viewerContext.mounted) {
                          Navigator.of(viewerContext).maybePop();
                        }
                      },
                    ),
                    onChannelTap: (channelId) {
                      openChannelLink(
                        context: context,
                        ref: ref,
                        channelId: channelId,
                        currentChannelId: currentChannelId,
                      );
                    },
                    onMentionTap: (pubkey) =>
                        showUserProfileSheet(context, pubkey),
                  ),
                if (message.reactions.isNotEmpty)
                  ReactionRow(
                    messageId: message.id,
                    reactions: message.reactions,
                    onToggle: (emoji) => toggleReaction(ref, message, emoji),
                    showAddButton: isMember && !isArchived,
                    onAddReaction: () => showAddReactionPicker(
                      context: context,
                      ref: ref,
                      message: message,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
