// The cassette designer's one canvas session: the target and assembly
// selection the canvas carries through an edit.

export const createCanvasSession = () => ({
  target: null,
  returnState: null
});

export const beginCanvasSession = (session, { mode, id = '', returnState = null }) => {
  session.target = { mode, id, key: `${mode}:${id}` };
  session.returnState = returnState;
  return session.target;
};

export const endCanvasSession = (session) => {
  const state = { returnState: session.returnState };
  session.target = null;
  session.returnState = null;
  return state;
};
