# EAS “Prepare project” / `tar` hatası — nasıl debug edilir?

Bulut build logunda şuna benzer bir satır görürsünüz:

`tar -C /home/expo/workingdir/build --strip-components 1 -zxf .../project.tar.gz exited with non-zero code: 2`

## Neden `ls` / `file` / `tar -tzf` ekleyemiyorsunuz?

**Expo’nun “Prepare project” adımı** kendi altyapısında çalışır; bu aşamaya özel shell komutu enjekte edemezsiniz. `/home/expo/workingdir/` yolları sadece worker içindir.

Önerdiğiniz üç komut doğru **teşhis mantığıdır**; eşdeğerini **kendi makinenizde** yaparsınız (aşağıda).

## Yerelde aynı arşiv içeriğini görmek (resmi yol)

Expo FYI: [How projects are uploaded to EAS Build](https://github.com/expo/fyi/blob/main/eas-build-archive.md)

```bash
npx eas-cli build:inspect --platform ios --stage archive --output ./.eas-archive-inspect --profile testflight
```

- Çıktı: EAS’in yükleyeceği dosya ağacı (`.tar.gz` dosyası değil, **klasör**).
- İçinde `node_modules` olmamalı; `.easignore` kullanıyorsanız kuralların burada yansıdığını kontrol edin.

Projede kısayol:

```bash
npm run eas:inspect-archive
```

## `tar -tzf` benzeri kontrol (Linux / macOS / WSL)

Worker GNU `tar` kullandığı için mümkünse **Linux tar** ile deneyin:

```bash
cd .eas-archive-inspect
tar -czf /tmp/eas-test.tar.gz .
mkdir -p /tmp/eas-extract && tar -xzf /tmp/eas-test.tar.gz -C /tmp/eas-extract
```

Hata alırsanız (izin, garip dosya adı, symlink), bulutdaki `tar` hatasının muhtemel nedeni budur.

Windows’ta sırf `tar.exe` ile bazen farklı davranış olabilir; şüphede **WSL** kullanın.

## `requireCommit` uyarısı

`eas.json` içinde `"requireCommit": true` kullanıyorsanız, resmi dokümana göre **`.easignore` devre dışı** kalır. Bu projede şu an yok; eklerseniz `.easignore` stratejinizi buna göre gözden geçirin.

## Özet

| Bulutta istediğiniz | Gerçekte yapılabilen |
|---------------------|----------------------|
| `ls` / `file` / `tar -t` worker’da | ❌ Yok |
| Aynı dosya listesi | `eas build:inspect --stage archive` |
| Bozuk arşiv / format | Yerelde klasörü `tar` ile paketleyip açarak test |
