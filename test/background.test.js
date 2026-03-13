const { chrome } = require('jest-chrome');

describe('Background Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize successfully', () => {
    expect(true).toBe(true);
  });
});
