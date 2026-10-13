/**
 * 원격 백업 저장소 추상화. 실제로는 Firebase Firestore를 쓰고,
 * 테스트/로컬 확인용으로는 폴더 저장소(MOYEO_PERSIST_DIR)를 쓸 수 있다.
 * 문서 경로는 "컬렉션/문서/컬렉션/문서" 형식, 값은 일반 객체(바이너리는 Buffer).
 */
export type DocData = Record<string, unknown>;

export interface RemoteStore {
  readonly name: string;
  get(path: string): Promise<DocData | null>;
  /** 여러 쓰기/삭제를 한 번에 (data가 null이면 삭제) */
  batch(ops: { path: string; data: DocData | null }[]): Promise<void>;
  /** 컬렉션 안의 문서 ID 목록 */
  list(collectionPath: string): Promise<string[]>;
}
