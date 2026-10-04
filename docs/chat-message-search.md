# Search within conversations or across all chats

Use the **Search messages** magnifying-glass button in the floating chat or full
Messages page. Choose **This chat** or **All my chats**, then enter a query.
The conversation control defaults to the current chat; the conversation-list
control searches all chats and has no current-chat selection.

## Matching and results

- Search matches message text, sender names and conversation names as shown.
  All entered words must match the combined text; matching ignores case and
  accents.
- Activity notices are searchable by their displayed description, activity name
  and displayed RPE. They do not contain the full activity comment text.
- Results show the conversation, sender, date/time and message text, newest first.
  The first 50 matches are displayed initially; **Show more** reveals additional
  results without discarding older matches.
- Selecting a result opens its conversation, scrolls to the message and highlights
  it. A new incoming message does not immediately move the view away from that
  selected historical message. Sending a message clears the selection and returns
  to the end of the conversation.
- The dialog supports mobile/desktop layouts, empty results, loading and retry
  after a failed history request. Queries are limited to 200 characters and reset
  when the dialog is reopened.

## Conversation names

Conversations between people are named after their participants, built for the
person viewing them: the other participants first (alphabetically) and the
viewer last, with current names. The stored title is a snapshot ordered by user
ID and shared by every participant, so it is only a fallback when participant
names are unavailable. Conversations about a training session keep the session
name. The same name is used in the conversation list, the conversation header,
the floating chat and search results.

## Data access and implementation limits

Search uses the complete message histories already returned by the authenticated
`GET /messages/threads` endpoint. Its server query restricts results to threads
where the requester is a participant. **All my chats** means those conversations,
not all installation users' messages. No new search endpoint, table, index, AI
provider or external dependency is introduced.

Filtering happens in the browser. WebSocket create/edit events update the cached
histories; REST message mutations invalidate the thread list. Searches do not
send messages or create read receipts themselves. Opening a result uses the
existing conversation's read-receipt behavior.

This is text matching, not semantic AI search or a search of arbitrary athlete
records. It includes all history returned by the current endpoint, not just the
visible message list. If that endpoint is paginated in the future, this approach
must be replaced or extended to preserve full-history search. Large installations
still inherit the existing cost of loading all authorized histories.

The coach AI assistant has a separate temporary conversation and is outside
this human-to-human chat search.

## Verification

```sh
node --experimental-strip-types --test scripts/tests/message-search.test.mjs
node scripts/tests/message-search.browser.mjs
node scripts/tests/chat-activity-notice.browser.mjs
pnpm web tsc:check
pnpm check:translations
```

Browser scripts require isolated Vite on port 5188 and Chromium CDP on 9331;
`QA_WEB_URL` and `QA_CDP_URL` override them. They use fictional data and mocked API/
WebSocket traffic, with external requests blocked. Coverage includes both search
scopes, old messages, sender/notice matching, long results, live updates, focus,
sending after searching, error recovery and existing activity-dialog behavior.

## Source references

- [Search component](../apps/web/src/components/messages/message-search.tsx)
- [Search matching](../apps/web/src/utils/message-search.ts)
- [Conversation names](../apps/web/src/utils/messages.ts)
- [Authorized history query](../apps/api/src/modules/messages/services/message-thread.service.ts)
