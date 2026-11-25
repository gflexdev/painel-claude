// Copie para include/secrets.h (fica fora do git) e preencha.
//   cp include/secrets.example.h include/secrets.h
#pragma once

// Wi-Fi de 2,4 GHz (o ESP32-S3 não conecta em 5 GHz).
#define PAINEL_WIFI_SSID "minha-rede"
#define PAINEL_WIFI_PASS "senha-da-rede"

// Onde o servidor painel-claude roda: IP do Mac na rede local (melhor reservar no roteador)
// ou o nome mDNS, por exemplo "MacBook-de-Fulano.local".
#define PAINEL_HOST "192.168.0.10"
#define PAINEL_PORT 7777

// Token de ~/.config/painel-claude/config.json no Mac (campo "token").
// Com ele dá para aprovar comandos no Mac: não compartilhe este arquivo.
#define PAINEL_TOKEN "cole-o-token-aqui"

// Fuso do relógio da barra (minutos em relação ao UTC). Brasília = -180.
#define PAINEL_TZ_OFFSET_MIN (-180)

// Brilho (%): cheio com sessão esperando/rodando ou toque recente; baixo depois de um tempo parado.
#define PAINEL_BRILHO_CHEIO 100
#define PAINEL_BRILHO_BAIXO 10

// Som do mostrador redondo (alto-falante no conector SPK) quando uma sessão passa a esperar você.
// 0 a 100; 0 = mudo. A Guition não tem alto-falante e ignora.
#define PAINEL_SOM_VOLUME 70
