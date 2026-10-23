/** The diagnostic observer must never replace the original startup rejection.
 * No renderer/readiness call is made here. onTerminal runs before UI teardown. */
export async function observeOperation(operation, { onBegin, onTerminal, onObserverError = () => {} }) {
  const safely = callback => {
    try { callback(); } catch (error) { try { onObserverError(error); } catch {} }
  };
  safely(onBegin);
  let value;
  try { value = await operation(); }
  catch (error) {
    safely(() => onTerminal('rejected', error));
    throw error;
  }
  safely(() => onTerminal('resolved'));
  return value;
}
