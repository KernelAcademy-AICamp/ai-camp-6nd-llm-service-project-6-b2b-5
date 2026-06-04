import { MOCK_CHILDREN } from "./children";
import { MOCK_SESSION } from "./session";
import { MOCK_CHILD_PHOTOS } from "./photos";

export type MockSessionData = {
  children: typeof MOCK_CHILDREN;
  session: typeof MOCK_SESSION;
  childPhotos: typeof MOCK_CHILD_PHOTOS;
};

export function getMockSessionData(): MockSessionData {
  return {
    children: MOCK_CHILDREN,
    session: MOCK_SESSION,
    childPhotos: MOCK_CHILD_PHOTOS,
  };
}

export { MOCK_CHILDREN, MOCK_SESSION, MOCK_CHILD_PHOTOS };
