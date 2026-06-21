// Reusable harness for the ADR-0007 wire contract: every legal state-machine
// transition emits exactly one typed event. External plugin authors and
// internal services share this — when DebugService / AssetPipelineService
// formalise their FSMs they reuse the same assertion utilities.
//
// Usage sketch:
//
//   import { assertExactlyOneEvent, assertNoEvent } from '@ports/test'
//
//   // Legal transition: exactly one event with the expected payload.
//   const got = await assertExactlyOneEvent(
//     (cb) => events.on('run:state', cb),
//     async () => svc.run(),
//   )
//   expect(got).toEqual({ status: 'running', prev: 'loaded' })
//
//   // Illegal transition: no event leaks even when the call throws.
//   await assertNoEvent(
//     (cb) => events.on('run:state', cb),
//     async () => expect(() => svc.run()).toThrow(),
//   )

/** Subscribe to an event for the duration of `action`, return every payload
 *  observed. The harness asserts exactly-one externally so the caller can
 *  inspect the payload shape with its own matcher. */
export async function captureEvents<P>(
  subscribe: (handler: (payload: P) => void) => () => void,
  action: () => Promise<void> | void,
): Promise<P[]> {
  const received: P[] = []
  const unsub = subscribe((p) => received.push(p))
  try {
    await action()
  } finally {
    unsub()
  }
  return received
}

/** Drive `action`; assert exactly one event was emitted on the subscribed
 *  channel during its run. Returns the single payload for further inspection. */
export async function assertExactlyOneEvent<P>(
  subscribe: (handler: (payload: P) => void) => () => void,
  action: () => Promise<void> | void,
): Promise<P> {
  const received = await captureEvents(subscribe, action)
  if (received.length !== 1) {
    throw new Error(
      `assertExactlyOneEvent: expected 1 event, received ${received.length} — ${JSON.stringify(received)}`,
    )
  }
  return received[0]!
}

/** Drive `action`; assert no events were emitted on the subscribed channel.
 *  Used to verify illegal transitions don't leak spurious events even when
 *  the FSM throws. */
export async function assertNoEvent<P>(
  subscribe: (handler: (payload: P) => void) => () => void,
  action: () => Promise<void> | void,
): Promise<void> {
  const received = await captureEvents(subscribe, action)
  if (received.length !== 0) {
    throw new Error(
      `assertNoEvent: expected 0 events, received ${received.length} — ${JSON.stringify(received)}`,
    )
  }
}
