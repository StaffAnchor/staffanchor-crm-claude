// The CRM has no toast library. In the staff view nothing is saved from this screen, so these messages are not needed.
const quiet = () => {};
export const toast = { success: quiet, error: quiet };
