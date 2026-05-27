global.__setUnitMock = (request, exports) => jest.doMock(request, () => exports, { virtual: false });
global.__clearUnitMocks = () => {
  jest.resetModules();
  jest.clearAllMocks();
};
jest.mock("@ionic/vue", () => ({
  toastController: {
    create: jest.fn(async () => ({
      present: jest.fn()
    }))
  }
}));
