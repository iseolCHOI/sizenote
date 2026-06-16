// Firestore 데이터 처리
// 각 사용자의 기록은 users/{uid}/garments 컬렉션에 저장됩니다.
// 로그인한 본인 기록만 읽고 쓸 수 있습니다 (보안 규칙으로 강제).

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

const col = (uid) => collection(db, "users", uid, "garments");

// 실시간 구독: 기록이 바뀌면 콜백이 자동 호출됩니다 (기기 간 즉시 동기화)
export function subscribeGarments(uid, callback) {
  const q = query(col(uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(items);
    },
    (err) => {
      console.error("구독 오류:", err);
      callback([]);
    }
  );
}

export async function saveGarment(uid, garment) {
  const { id, ...data } = garment;
  await setDoc(doc(db, "users", uid, "garments", id), data);
}

export async function deleteGarment(uid, id) {
  await deleteDoc(doc(db, "users", uid, "garments", id));
}
