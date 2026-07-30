# Mengaktifkan database user dan saldo

Kode bot sudah mendukung Cloudflare D1 dengan binding bernama `DB`.

## 1. Buat database D1

Di Cloudflare Dashboard:

1. Buka **Storage & Databases** → **D1 SQL Database**.
2. Tekan **Create database**.
3. Gunakan nama `bikin-foto-db`.

## 2. Hubungkan D1 ke Worker

1. Buka **Workers & Pages** → Worker `bikin-foto`.
2. Buka **Settings** → **Bindings**.
3. Tekan **Add binding**.
4. Pilih **D1 database**.
5. Isi variable name dengan `DB`.
6. Pilih database `bikin-foto-db`.
7. Simpan dan deploy ulang Worker.

Tabel `users`, `transactions`, dan `orders` dibuat otomatis saat bot menerima pesan pertama. Skema juga tersedia pada `migrations/0001_balance_system.sql`.

## 3. Atur admin

Bot mengenali username `@Abdulgoib` sebagai admin secara bawaan. Untuk keamanan yang lebih kuat, tambahkan secret/variable berikut pada Worker:

- `ADMIN_TELEGRAM_ID`: ID angka akun Telegram admin.
- `ADMIN_TELEGRAM_USERNAME`: `Abdulgoib` (opsional).

Kirim `/id` ke bot untuk melihat ID Telegram Anda.

## 4. Perintah admin

```text
/adminhelp
/addsaldo <ID|@username> <nominal> [catatan]
/kurangsaldo <ID|@username> <nominal> [catatan]
/cekuser <ID|@username>
/listuser
/mutasi <ID|@username>
/refund <nomor_order>
/stats
/id
```

Contoh:

```text
/addsaldo 123456789 10000 Top up manual
/addsaldo @namauser 10k
/kurangsaldo 123456789 500 Koreksi saldo
```

User harus pernah mengirim `/start` agar tercatat sebelum saldonya dapat ditambah.

## 5. Memeriksa database

Buka alamat berikut dengan nilai `SETUP_KEY` milik Worker:

```text
https://ALAMAT-WORKER/db-status?key=SETUP_KEY
```

Respons berhasil akan menampilkan jumlah user, total saldo, dan jumlah pesanan.

## Cara kerja saldo

- Setiap user otomatis terdaftar saat mengirim pesan ke bot.
- Menu **Saldo** membaca saldo asli dari D1.
- Saat user membalas permintaan prompt/foto, bot mengecek harga dan saldo.
- Saldo tidak cukup: pesanan ditolak.
- Saldo cukup: saldo dipotong, transaksi dicatat, dan order disimpan.
- Telegram `update_id` digunakan untuk mencegah pemotongan ganda akibat pengiriman ulang webhook.
- Admin dapat mengembalikan saldo dengan `/refund <nomor_order>`.

> Integrasi xAI belum aktif. Order yang lolos saldo saat ini disimpan berstatus `pending`. Jangan melakukan pengujian berbayar dengan saldo nyata sebelum koneksi xAI selesai, atau refund order pengujian menggunakan perintah admin.
