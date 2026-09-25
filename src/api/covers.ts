// Covers the catalogue doesn't have (store exclusives like FOMO Books in
// Dubai): a collector's own photo, shared with everyone. The image goes in the
// public comic-covers bucket under the uploader's folder, the listing in
// comic_custom_covers; the API then shows it as a variant and scans match it.
import { supabase } from '../supabase';
import { api } from './client';
import type { ComicLite, Variant } from '../types';

const BUCKET = 'comic-covers';

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function addCustomCover(comic: ComicLite, jpegBase64: string, name: string): Promise<Variant> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Log in to add covers');
  const id = crypto.randomUUID();
  const path = `${uid}/${id}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, b64ToBlob(jpegBase64), { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const clean = name.trim().slice(0, 80) || 'Collector photo';
  const ins = await supabase.from('comic_custom_covers').insert({ id, comic_id: comic.id, name: clean, image_url: url, created_by: uid });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(ins.error.message);
  }
  await api.forgetComic(comic.id);
  return { id: `custom:${id}`, name: clean, cover: url, custom: true, by: uid, price: comic.price };
}

/** Remove a cover photo you added (the listing and the image). */
export async function removeCustomCover(comicId: string, v: Variant): Promise<void> {
  const id = v.id.replace(/^custom:/, '');
  const del = await supabase.from('comic_custom_covers').delete().eq('id', id);
  if (del.error) throw new Error(del.error.message);
  const path = v.cover?.split(`/object/public/${BUCKET}/`)[1];
  if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  await api.forgetComic(comicId);
}
