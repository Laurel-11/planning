import { json } from "../_lib.js";

const SPOTS = [
  { id: "cf_1", name: "天安门广场", category: "公园景点", heat: 98, tip: "适合散步和拍照打卡", price: 0, duration_min: 90, lat: 39.9087, lng: 116.3975, img_emoji: "🌿" },
  { id: "cf_2", name: "国家博物馆", category: "文化展览", heat: 96, tip: "适合慢慢逛展，雨天也友好", price: 0, duration_min: 120, lat: 39.9051, lng: 116.4015, img_emoji: "🎨" },
  { id: "cf_3", name: "王府井步行街", category: "购物", heat: 94, tip: "适合顺路逛街和吃饭", price: 80, duration_min: 120, lat: 39.9155, lng: 116.411, img_emoji: "🛍️" },
];

export async function onRequestGet() {
  return json({
    spots: SPOTS,
    home: { name: "天安门", lat: 39.9087, lng: 116.3975 },
  });
}

