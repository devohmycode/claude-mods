/**
 * The `$.message` noun as every caller sees it: the one contract for the
 * noun, its types declared on the `claude-code` module and the noun declared
 * on `EngineInterface`.
 *
 * The message mod adds the noun in the `engine.create` fold and checks its
 * return against `EngineInterface['message']`; its own hooks import these
 * types from `claude-code`, and a plugin that writes to another session
 * reads them the same way once `/plugin-types` has copied this file beside
 * the engine's own declarations. Nothing here is imported, so it stands on
 * its own.
 *
 * Every verb of `$` is itself an event other plugins may hook, so
 * `on("message.send", …)` is a legitimate thing for a third party to write:
 * this contract is an API and not an internal detail.
 *
 * One rule runs through the figures here. **A figure carries its unit.** A
 * count of messages and a length in bytes are two quantities; they are never
 * summed, because a total over two units says nothing.
 */

declare module 'claude-code' {
  /**
   * What another session sent and what this one answers: the thread the
   * Message tab draws, reachable by a plugin that would rather call than
   * draw.
   *
   * Present wherever the message mod is seated.
   */
  export type Message = {
    /**
     * Sends one message to another session, without a model turn: the call
     * goes out through `SendMessage` in this session's own loop.
     *
     * @param to the recipient, as `ListAgents` names it
     * @param text the message; its first line is what the recipient previews
     * @returns whether it went out — false where `SendMessage` is not
     *   mounted, where the recipient refused it, or where the text is empty
     * @example
     * await $.message.send("tokenos", "the bench is free again")
     */
    send: (to: string, text: string) => Promise<boolean>

    /**
     * Hands the held messages to Claude, which is the one moment they enter
     * a context and cost what they would have cost all along.
     *
     * @param who one correspondent, or every one of them where absent
     * @returns how many were handed over; 0 where none was held
     */
    hand: (who?: string) => Promise<number>

    /**
     * The deliveries this session took and has not handed over: what is on
     * screen and not in the context.
     *
     * @returns the held messages, oldest first
     */
    held: () => Promise<readonly MessageHeld[]>

    /**
     * What this session avoided and what it kept, each figure with its own
     * unit.
     *
     * @returns the counts and the bytes
     */
    counts: () => Promise<MessageCounts>
  }

  /**
   * One held delivery.
   */
  export type MessageHeld = {
    /**
     * When it arrived, on the engine's clock.
     */
    at: number

    /**
     * Who sent it, as the delivery's own frame named them; a name of this
     * mod's own where the frame named none.
     */
    who: string

    /**
     * The delivery, whole.
     */
    text: string

    /**
     * Its length in bytes, measured: what the transcript did not carry.
     */
    bytes: number
  }

  /**
   * What the tab's footer draws, and what a report of this mod would read.
   *
   * Four figures in two units — three counts and a length — and no total
   * over them.
   */
  export type MessageCounts = {
    /**
     * Messages sent from the tab. Each one is a model turn that did not
     * start, since the field calls the tool itself.
     */
    sent: number

    /**
     * Deliveries taken and still held out of the context.
     */
    held: number

    /**
     * Deliveries since handed to Claude.
     */
    handed: number

    /**
     * The bytes the held deliveries would have written to the transcript,
     * measured rather than estimated, and never added to the counts above.
     */
    bytes: number
  }

  interface EngineInterface {
    /**
     * The messages other sessions sent, and the answers this one makes;
     * present where the message mod is seated.
     */
    message: Message
  }
}
