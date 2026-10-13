#!/usr/bin/env bash
# توليد كل أصول الهوية (شعار التطبيق، أيقونات الويب، أيقونات أندرويد، شاشة الإقلاع)
# من الشعار الرئيسي branding/logo-master.png باستخدام ImageMagick.
# الاستخدام: bash scripts/generate-brand-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MASTER="branding/logo-master.png"
WORK="branding/.work"
mkdir -p "$WORK"

GREEN="#047857"


# 1) خلفية خارجية شفافة (ملء فيضي من الزاوية) ثم قصّ لحواف الشعار
convert "$MASTER" -alpha set -fuzz 9% -fill none -draw "color 4,4 floodfill" "$WORK/logo-transparent.png"
convert "$WORK/logo-transparent.png" -trim +repage "$WORK/logo-trim.png"

# 2) شعار التطبيق داخل الواجهة (خلفية شفافة)
convert "$WORK/logo-trim.png" -strip -depth 8 -define png:compression-level=9 -resize 384x src/assets/logo.png

# 3) أيقونة مربّعة بزوايا دائرية خلفية خضراء متدرّجة + الشعار وسطها
make_icon() {
  S=$1
  OUT=$2
  R=$(( S * 22 / 100 ))
  LOGOW=$(( S * 78 / 100 ))
  convert -size "${S}x${S}" xc:${GREEN} -strip -depth 8 \
    \( -size "${S}x${S}" xc:none -fill white -draw "roundrectangle 0,0,$((S-1)),$((S-1)),${R},${R}" \) \
    -compose CopyOpacity -composite "$WORK/bg-$S.png"
  convert "$WORK/bg-$S.png" \( "$WORK/logo-trim.png" -resize "${LOGOW}x${LOGOW}" \) \
    -gravity center -compose over -composite "$OUT"
}

# أيقونات الويب
make_icon 512 public/icon-512.png
make_icon 192 public/icon-192.png
make_icon 180 public/apple-touch-icon.png
make_icon 64  public/favicon.png

# favicon.ico متعدد المقاسات
for s in 16 32 48 64 128 256; do make_icon "$s" "$WORK/ico-$s.png"; done
convert "$WORK/ico-16.png" "$WORK/ico-32.png" "$WORK/ico-48.png" \
        "$WORK/ico-64.png" "$WORK/ico-128.png" "$WORK/ico-256.png" public/favicon.ico

# 4) أيقونات أندرويد (mipmap + drawable-port-xhdpi)
declare -A DPI=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  S=${DPI[$d]}
  make_icon "$S" "$WORK/laun-$S.png"
  cp "$WORK/laun-$S.png" "android/app/src/main/res/mipmap-$d/ic_launcher.png"
  cp "$WORK/laun-$S.png" "android/app/src/main/res/mipmap-$d/ic_launcher_round.png"
done
cp "$WORK/laun-96.png" android/app/src/main/res/drawable-port-xhdpi/ic_launcher.png
cp "$WORK/laun-96.png" android/app/src/main/res/drawable-port-xhdpi/ic_launcher_round.png

# 5) طبقة الأمام للأيقونة التكيفية (خلفية شفافة، الشعار ضمن المنطقة الآمنة 66%)
declare -A FGD=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  S=${FGD[$d]}
  L=$(( S * 66 / 100 ))
  convert -size "${S}x${S}" xc:none \
    \( "$WORK/logo-trim.png" -resize "${L}x${L}" \) \
    -gravity center -compose over -composite \
    "android/app/src/main/res/mipmap-$d/ic_launcher_foreground.png"
done
cp android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png \
   android/app/src/main/res/drawable-port-xhdpi/ic_launcher_foreground.png

# 6) شاشات الإقلاع (خلفية خضراء متدرّجة + الشعار وسطها)
make_splash() {
  W=$1; H=$2; OUT=$3
  M=$(( W < H ? W : H ))
  L=$(( M * 45 / 100 ))
  convert -size "${W}x${H}" xc:${GREEN} -strip -depth 8 \
    \( "$WORK/logo-trim.png" -resize "${L}x${L}" \) \
    -gravity center -compose over -composite "$OUT"
}
R=android/app/src/main/res
make_splash 320 480    "$R/drawable-port-mdpi/splash.png"
make_splash 480 800    "$R/drawable-port-hdpi/splash.png"
make_splash 720 1280   "$R/drawable-port-xhdpi/splash.png"
make_splash 960 1600   "$R/drawable-port-xxhdpi/splash.png"
make_splash 1280 1920  "$R/drawable-port-xxxhdpi/splash.png"
make_splash 480 320    "$R/drawable-land-mdpi/splash.png"
make_splash 800 480    "$R/drawable-land-hdpi/splash.png"
make_splash 1280 720   "$R/drawable-land-xhdpi/splash.png"
make_splash 1600 960   "$R/drawable-land-xxhdpi/splash.png"
make_splash 1920 1280  "$R/drawable-land-xxxhdpi/splash.png"
make_splash 720 1280   "$R/drawable/splash.png"

rm -rf "$WORK"
echo "تم توليد كل أصول الهوية بنجاح ✓"
