# ChatGPT Share Format Notes

Read this file only when `extract_chatgpt_share.js` fails or ChatGPT changes its
share-page serialization.

## Stream Data

The page normally contains:

```html
<script>
window.__reactRouterContext.streamController.enqueue("...")
</script>
```

The first enqueue value is usually a JSON string containing a second JSON value.
The decoded value is a flat reference table.

Important entries:

```text
table[86]  → linear_conversation references
number > 0 → index into the flat table
number < 0 → null/sentinel value
object key "_N" → table[N] is the semantic key
```

## Message Selection

Assistant messages can contain:

- Final merged responses.
- Hidden continuation fragments.
- Partial stream snapshots.

Prefer:

```text
metadata.is_merged_message === true
```

Skip:

```text
metadata.is_visually_hidden_from_conversation === true
```

If no merged message exists, choose the last visible assistant response with
`end_turn === true` or `metadata.is_complete === true`.

Messages from the same user prompt can be duplicates. Prefer merged responses and
longer complete chapter bodies.

## Common Errors

### `ChatGPT share stream data was not found`

- The link may not be public.
- The browser may be showing a login page.
- OpenAI changed the HTML serialization.

Save the page source and compare its script tags with the stream pattern above.

### `linear_conversation was not found`

The root table was decoded, but its `table[86]` entry changed. Inspect nearby
reference-table keys for a string named `linear_conversation`.

### No final answers

- Check that assistant messages are visible.
- Check `metadata.is_merged_message`.
- Check `metadata.is_visually_hidden_from_conversation`.
- Do not fall back to copying hidden stream fragments.

## Privacy

HTML may contain a logged-in page shell. Never persist cookies, request headers,
tokens, or authentication data in generated Markdown or the manifest.
