# Bikin Foto

Bot Telegram untuk generate gambar dan video AI.

## Top up QRIS manual

Bot mengambil gambar QRIS dinamis dari Worker `qris-dinamis-telegram`, lalu mengirim
invoice foto dengan tombol **Saya Sudah Bayar** dan **Batalkan Pesanan**. Tombol bayar
hanya mengirim notifikasi kepada admin untuk memeriksa mutasi; saldo tetap ditambahkan
manual menggunakan command admin.

Tambahkan secret `QRIS_API_KEY` pada Worker `bikin-foto` dengan nilai yang sama persis
seperti pada Worker QRIS. Setelah deploy, jalankan kembali endpoint `/setup` menggunakan
`SETUP_KEY` agar webhook Telegram menerima update `callback_query` dari tombol invoice.
