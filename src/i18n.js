// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface: appareil / Gerät / dispositivo, scène / Szene / escena; and of
// the OPNsense interface: passerelle / Gateway / puerta de enlace, règle /
// Regel / regla.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  firewallDeviceName: {
    en: 'OPNsense {name}',
    fr: 'OPNsense {name}',
    de: 'OPNsense {name}',
    es: 'OPNsense {name}',
  },
  gatewayDeviceName: {
    en: 'Gateway {name}',
    fr: 'Passerelle {name}',
    de: 'Gateway {name}',
    es: 'Puerta de enlace {name}',
  },
  interfaceDeviceName: {
    en: 'Interface {name}',
    fr: 'Interface {name}',
    de: 'Schnittstelle {name}',
    es: 'Interfaz {name}',
  },
  ruleDeviceName: {
    en: 'Rule {name}',
    fr: 'Règle {name}',
    de: 'Regel {name}',
    es: 'Regla {name}',
  },
  featureCpu: { en: 'CPU usage', fr: 'Utilisation CPU', de: 'CPU-Auslastung', es: 'Uso de CPU' },
  featureMemory: {
    en: 'Memory usage',
    fr: 'Utilisation mémoire',
    de: 'Speicherauslastung',
    es: 'Uso de memoria',
  },
  featureDisk: {
    en: 'Disk usage',
    fr: 'Utilisation disque',
    de: 'Festplattenbelegung',
    es: 'Uso de disco',
  },
  featureTemperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  featureUptime: {
    en: 'Uptime',
    fr: 'Temps de fonctionnement',
    de: 'Betriebszeit',
    es: 'Tiempo en marcha',
  },
  featureUpdates: {
    en: 'Pending updates',
    fr: 'Mises à jour en attente',
    de: 'Ausstehende Updates',
    es: 'Actualizaciones pendientes',
  },
  featureVersion: { en: 'Version', fr: 'Version', de: 'Version', es: 'Versión' },
  featureVpnPeers: {
    en: 'VPN peers online',
    fr: 'Pairs VPN connectés',
    de: 'Verbundene VPN-Peers',
    es: 'Pares VPN conectados',
  },
  featureGatewayStatus: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  featureDelay: { en: 'Latency', fr: 'Latence', de: 'Latenz', es: 'Latencia' },
  featureLoss: {
    en: 'Packet loss',
    fr: 'Perte de paquets',
    de: 'Paketverlust',
    es: 'Pérdida de paquetes',
  },
  featureReceived: { en: 'Received', fr: 'Reçu', de: 'Empfangen', es: 'Recibido' },
  featureSent: { en: 'Sent', fr: 'Envoyé', de: 'Gesendet', es: 'Enviado' },
  featureLink: { en: 'Link', fr: 'Lien', de: 'Verbindung', es: 'Enlace' },
  featureIpv4: {
    en: 'IPv4 address',
    fr: 'Adresse IPv4',
    de: 'IPv4-Adresse',
    es: 'Dirección IPv4',
  },
  featureRuleEnabled: { en: 'Enabled', fr: 'Activée', de: 'Aktiviert', es: 'Activada' },
  featurePresence: { en: 'Presence', fr: 'Présence', de: 'Anwesenheit', es: 'Presencia' },

  // states
  gateway_online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  gateway_offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  gateway_degraded: { en: 'Degraded', fr: 'Dégradée', de: 'Beeinträchtigt', es: 'Degradada' },
  gateway_pending: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente' },
  link_up: { en: 'Up', fr: 'Actif', de: 'Aktiv', es: 'Activo' },
  link_down: { en: 'Down', fr: 'Inactif', de: 'Inaktiv', es: 'Inactivo' },
  link_no_carrier: {
    en: 'No carrier',
    fr: 'Câble débranché',
    de: 'Kein Kabel',
    es: 'Sin portadora',
  },

  // scene summaries
  summaryGateway_online: {
    en: 'Gateway {name} is back online ({delay} ms).',
    fr: 'La passerelle {name} est de nouveau en ligne ({delay} ms).',
    de: 'Gateway {name} ist wieder online ({delay} ms).',
    es: 'La puerta de enlace {name} vuelve a estar en línea ({delay} ms).',
  },
  summaryGateway_offline: {
    en: 'Gateway {name} is offline.',
    fr: 'La passerelle {name} est hors ligne.',
    de: 'Gateway {name} ist offline.',
    es: 'La puerta de enlace {name} está sin conexión.',
  },
  summaryGateway_degraded: {
    en: 'Gateway {name} is degraded: {delay} ms, {loss} % loss.',
    fr: 'La passerelle {name} est dégradée : {delay} ms, {loss} % de perte.',
    de: 'Gateway {name} ist beeinträchtigt: {delay} ms, {loss} % Verlust.',
    es: 'La puerta de enlace {name} está degradada: {delay} ms, {loss} % de pérdida.',
  },
  summaryGateway_pending: {
    en: 'Gateway {name} is being checked.',
    fr: 'La passerelle {name} est en cours de vérification.',
    de: 'Gateway {name} wird geprüft.',
    es: 'La puerta de enlace {name} se está comprobando.',
  },
  summaryPresence_arrived: {
    en: '{name} is connected to the network.',
    fr: '{name} est connecté au réseau.',
    de: '{name} ist mit dem Netzwerk verbunden.',
    es: '{name} está conectado a la red.',
  },
  summaryPresence_left: {
    en: '{name} left the network.',
    fr: '{name} a quitté le réseau.',
    de: '{name} hat das Netzwerk verlassen.',
    es: '{name} ha salido de la red.',
  },
  summaryNewHost: {
    en: 'New device on the network: {name} ({ip}, {iface}).',
    fr: 'Nouvel appareil sur le réseau : {name} ({ip}, {iface}).',
    de: 'Neues Gerät im Netzwerk: {name} ({ip}, {iface}).',
    es: 'Nuevo dispositivo en la red: {name} ({ip}, {iface}).',
  },
  summaryPeer_connected: {
    en: 'VPN peer {name} connected ({iface}).',
    fr: 'Le pair VPN {name} est connecté ({iface}).',
    de: 'VPN-Peer {name} ist verbunden ({iface}).',
    es: 'El par VPN {name} se ha conectado ({iface}).',
  },
  summaryPeer_disconnected: {
    en: 'VPN peer {name} disconnected ({iface}).',
    fr: 'Le pair VPN {name} est déconnecté ({iface}).',
    de: 'VPN-Peer {name} ist getrennt ({iface}).',
    es: 'El par VPN {name} se ha desconectado ({iface}).',
  },
  summaryService_started: {
    en: 'The service {name} started.',
    fr: 'Le service {name} a démarré.',
    de: 'Der Dienst {name} wurde gestartet.',
    es: 'El servicio {name} se ha iniciado.',
  },
  summaryService_stopped: {
    en: 'The service {name} stopped.',
    fr: 'Le service {name} s’est arrêté.',
    de: 'Der Dienst {name} wurde beendet.',
    es: 'El servicio {name} se ha detenido.',
  },
  firmwareUnchecked: {
    en: 'No update check has been run on OPNsense yet.',
    fr: 'Aucune recherche de mises à jour n’a encore été lancée sur OPNsense.',
    de: 'Auf OPNsense wurde noch keine Update-Prüfung ausgeführt.',
    es: 'Todavía no se ha buscado ninguna actualización en OPNsense.',
  },
  firmwareUpToDate: {
    en: 'OPNsense {version} is up to date.',
    fr: 'OPNsense {version} est à jour.',
    de: 'OPNsense {version} ist aktuell.',
    es: 'OPNsense {version} está actualizado.',
  },
  firmwareUpdates: {
    en: '{count} OPNsense update(s) available{version}.',
    fr: '{count} mise(s) à jour OPNsense disponible(s){version}.',
    de: '{count} OPNsense-Update(s) verfügbar{version}.',
    es: '{count} actualización(es) de OPNsense disponible(s){version}.',
  },
  firmwareReboot: {
    en: 'A reboot will be needed.',
    fr: 'Un redémarrage sera nécessaire.',
    de: 'Ein Neustart wird nötig sein.',
    es: 'Será necesario reiniciar.',
  },
  summaryStatus: {
    en: 'OPNsense: CPU {cpu} %, memory {memory} %, {online}/{total} gateway(s) online.',
    fr: 'OPNsense : CPU {cpu} %, mémoire {memory} %, {online}/{total} passerelle(s) en ligne.',
    de: 'OPNsense: CPU {cpu} %, Speicher {memory} %, {online}/{total} Gateway(s) online.',
    es: 'OPNsense: CPU {cpu} %, memoria {memory} %, {online}/{total} puerta(s) de enlace en línea.',
  },
  summaryStatusOffline: {
    en: '{count} gateway(s) offline.',
    fr: '{count} passerelle(s) hors ligne.',
    de: '{count} Gateway(s) offline.',
    es: '{count} puerta(s) de enlace sin conexión.',
  },
  summaryStatusHosts: {
    en: '{count} device(s) on the network.',
    fr: '{count} appareil(s) sur le réseau.',
    de: '{count} Gerät(e) im Netzwerk.',
    es: '{count} dispositivo(s) en la red.',
  },

  // widgets
  overviewCaption: {
    en: '{name} · OPNsense {version} · {ago}',
    fr: '{name} · OPNsense {version} · {ago}',
    de: '{name} · OPNsense {version} · {ago}',
    es: '{name} · OPNsense {version} · {ago}',
  },
  uptimeValue: {
    en: '{days} d {hours} h',
    fr: '{days} j {hours} h',
    de: '{days} T. {hours} Std.',
    es: '{days} d {hours} h',
  },
  tileCpu: { en: 'CPU', fr: 'CPU', de: 'CPU', es: 'CPU' },
  tileMemory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  tileDisk: { en: 'Disk', fr: 'Disque', de: 'Festplatte', es: 'Disco' },
  tileTemperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  rowUptime: { en: 'Uptime', fr: 'En marche depuis', de: 'Betriebszeit', es: 'En marcha desde' },
  rowUpdates: { en: 'Updates', fr: 'Mises à jour', de: 'Updates', es: 'Actualizaciones' },
  updatesUnchecked: {
    en: 'Not checked',
    fr: 'Non vérifiées',
    de: 'Nicht geprüft',
    es: 'Sin comprobar',
  },
  updatesNone: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  updatesCount: {
    en: '{count} available',
    fr: '{count} disponible(s)',
    de: '{count} verfügbar',
    es: '{count} disponible(s)',
  },
  buttonCheckUpdates: {
    en: 'Check for updates',
    fr: 'Vérifier les MàJ',
    de: 'Updates prüfen',
    es: 'Buscar actualización',
  },
  buttonReboot: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
  internetCaption: {
    en: '{name} · {ip}',
    fr: '{name} · {ip}',
    de: '{name} · {ip}',
    es: '{name} · {ip}',
  },
  tileLatency: { en: 'Latency', fr: 'Latence', de: 'Latenz', es: 'Latencia' },
  tileLoss: { en: 'Loss', fr: 'Perte', de: 'Verlust', es: 'Pérdida' },
  tileDownload: { en: 'Download', fr: 'Réception', de: 'Download', es: 'Descarga' },
  tileUpload: { en: 'Upload', fr: 'Envoi', de: 'Upload', es: 'Subida' },
  chartTraffic: {
    en: 'Traffic (Mbit/s)',
    fr: 'Trafic (Mbit/s)',
    de: 'Datenverkehr (Mbit/s)',
    es: 'Tráfico (Mbit/s)',
  },
  noWan: {
    en: 'No gateway nor WAN interface found on OPNsense: choose them in the widget settings.',
    fr: 'Aucune passerelle ni interface WAN trouvée sur OPNsense : choisissez-les dans les réglages du widget.',
    de: 'Weder Gateway noch WAN-Schnittstelle auf OPNsense gefunden: wählen Sie sie in den Widget-Einstellungen.',
    es: 'No se encontró puerta de enlace ni interfaz WAN en OPNsense: elíjalas en los ajustes del widget.',
  },
  networkCaption: {
    en: '{present} connected of {total} known',
    fr: '{present} connecté(s) sur {total} connu(s)',
    de: '{present} verbunden von {total} bekannten',
    es: '{present} conectado(s) de {total} conocido(s)',
  },
  networkCaptionNew: {
    en: '{count} new in 7 days · {present} connected',
    fr: '{count} nouveau(x) en 7 jours · {present} connecté(s)',
    de: '{count} neu in 7 Tagen · {present} verbunden',
    es: '{count} nuevo(s) en 7 días · {present} conectado(s)',
  },
  networkMore: {
    en: '{count} more',
    fr: '{count} de plus',
    de: '{count} weitere',
    es: '{count} más',
  },
  networkEmpty_present: {
    en: 'No device answers on the network right now.',
    fr: 'Aucun appareil ne répond sur le réseau en ce moment.',
    de: 'Derzeit antwortet kein Gerät im Netzwerk.',
    es: 'Ningún dispositivo responde en la red en este momento.',
  },
  networkEmpty_absent: {
    en: 'No device left the network since the integration started.',
    fr: 'Aucun appareil n’a quitté le réseau depuis le démarrage de l’intégration.',
    de: 'Seit dem Start der Integration hat kein Gerät das Netzwerk verlassen.',
    es: 'Ningún dispositivo ha salido de la red desde que se inició la integración.',
  },
  networkEmpty_all: {
    en: 'OPNsense knows no device on the network yet.',
    fr: 'OPNsense ne connaît encore aucun appareil sur le réseau.',
    de: 'OPNsense kennt noch kein Gerät im Netzwerk.',
    es: 'OPNsense todavía no conoce ningún dispositivo en la red.',
  },
  networkEmpty_new: {
    en: 'No new device on the network these last 7 days.',
    fr: 'Aucun nouvel appareil sur le réseau ces 7 derniers jours.',
    de: 'Kein neues Gerät im Netzwerk in den letzten 7 Tagen.',
    es: 'Ningún dispositivo nuevo en la red en los últimos 7 días.',
  },
  firstSeen: { en: 'new, {ago}', fr: 'nouveau, {ago}', de: 'neu, {ago}', es: 'nuevo, {ago}' },
  badgeHere: { en: 'Here', fr: 'Présent', de: 'Da', es: 'Presente' },
  badgeGone: { en: 'Gone', fr: 'Parti', de: 'Weg', es: 'Ausente' },
  noPeers: {
    en: 'No WireGuard peer on this OPNsense.',
    fr: 'Aucun pair WireGuard sur cet OPNsense.',
    de: 'Kein WireGuard-Peer auf dieser OPNsense.',
    es: 'Ningún par WireGuard en este OPNsense.',
  },
  tilePeersOnline: {
    en: 'Peers online',
    fr: 'Pairs connectés',
    de: 'Verbundene Peers',
    es: 'Pares conectados',
  },
  handshake: {
    en: 'Handshake {ago}',
    fr: 'Échange {ago}',
    de: 'Handshake {ago}',
    es: 'Contacto {ago}',
  },
  noHandshake: {
    en: 'Never connected',
    fr: 'Jamais connecté',
    de: 'Nie verbunden',
    es: 'Nunca conectado',
  },
  peerOnline: { en: 'Online', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  peerOffline: { en: 'Offline', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },

  // connection status, actions, messages
  noCredentials: {
    en: 'Enter the address of OPNsense, the API key and its secret in the configuration.',
    fr: 'Saisissez l’adresse d’OPNsense, la clé d’API et son secret dans la configuration.',
    de: 'Geben Sie die Adresse von OPNsense, den API-Schlüssel und sein Geheimnis in der Konfiguration ein.',
    es: 'Introduzca la dirección de OPNsense, la clave de API y su secreto en la configuración.',
  },
  notReadYet: {
    en: 'OPNsense has not been read yet: come back in a few seconds.',
    fr: 'OPNsense n’a pas encore été lu : revenez dans quelques secondes.',
    de: 'OPNsense wurde noch nicht gelesen: Schauen Sie in ein paar Sekunden wieder vorbei.',
    es: 'OPNsense aún no se ha leído: vuelva en unos segundos.',
  },
  statusConnected: {
    en: 'OPNsense {version}: {gateways}/{total} gateway(s) online, {hosts} device(s) on the network.',
    fr: 'OPNsense {version} : {gateways}/{total} passerelle(s) en ligne, {hosts} appareil(s) sur le réseau.',
    de: 'OPNsense {version}: {gateways}/{total} Gateway(s) online, {hosts} Gerät(e) im Netzwerk.',
    es: 'OPNsense {version}: {gateways}/{total} puerta(s) de enlace en línea, {hosts} dispositivo(s) en la red.',
  },
  statusInvalidKey: {
    en: 'OPNsense refuses the API key: check the key and its secret.',
    fr: 'OPNsense refuse la clé d’API : vérifiez la clé et son secret.',
    de: 'OPNsense lehnt den API-Schlüssel ab: Prüfen Sie den Schlüssel und sein Geheimnis.',
    es: 'OPNsense rechaza la clave de API: compruebe la clave y su secreto.',
  },
  statusNoDashboard: {
    en: 'Connected, without the "Lobby: Dashboard" privilege (no CPU, memory, disk nor uptime): {gateways}/{total} gateway(s) online, {hosts} device(s) on the network.',
    fr: 'Connecté, sans le droit « Lobby: Dashboard » (ni CPU, mémoire, disque, durée) : {gateways}/{total} passerelle(s) en ligne, {hosts} appareil(s) sur le réseau.',
    de: 'Verbunden, ohne das Recht „Lobby: Dashboard“ (keine CPU, Speicher, Festplatte, Laufzeit): {gateways}/{total} Gateway(s) online, {hosts} Gerät(e) im Netzwerk.',
    es: 'Conectado, sin el privilegio «Lobby: Dashboard» (sin CPU, memoria, disco ni tiempo activo): {gateways}/{total} puerta(s) de enlace en línea, {hosts} dispositivo(s) en la red.',
  },
  statusForbidden: {
    en: 'The OPNsense user of the API key lacks a privilege: see the documentation.',
    fr: 'L’utilisateur OPNsense de la clé d’API n’a pas un des droits nécessaires : voir la documentation.',
    de: 'Dem OPNsense-Benutzer des API-Schlüssels fehlt ein Recht: siehe Dokumentation.',
    es: 'Al usuario de OPNsense de la clave de API le falta un privilegio: consulte la documentación.',
  },
  statusTls: {
    en: 'The HTTPS certificate of OPNsense is refused: untick “Verify the certificate” or install a valid one.',
    fr: 'Le certificat HTTPS d’OPNsense est refusé : décochez « Vérifier le certificat » ou installez-en un valide.',
    de: 'Das HTTPS-Zertifikat von OPNsense wird abgelehnt: Deaktivieren Sie „Zertifikat prüfen“ oder installieren Sie ein gültiges.',
    es: 'El certificado HTTPS de OPNsense es rechazado: desmarque «Verificar el certificado» o instale uno válido.',
  },
  statusNotFound: {
    en: 'This address does not answer like an OPNsense API: check the address.',
    fr: 'Cette adresse ne répond pas comme une API OPNsense : vérifiez l’adresse.',
    de: 'Diese Adresse antwortet nicht wie eine OPNsense-API: Prüfen Sie die Adresse.',
    es: 'Esta dirección no responde como una API de OPNsense: compruebe la dirección.',
  },
  statusUnreachable: {
    en: 'OPNsense does not answer at {url}: check the address and the network.',
    fr: 'OPNsense ne répond pas à {url} : vérifiez l’adresse et le réseau.',
    de: 'OPNsense antwortet nicht unter {url}: Prüfen Sie Adresse und Netzwerk.',
    es: 'OPNsense no responde en {url}: compruebe la dirección y la red.',
  },
  testOk: {
    en: 'Connected to {name} (OPNsense {version}).',
    fr: 'Connecté à {name} (OPNsense {version}).',
    de: 'Verbunden mit {name} (OPNsense {version}).',
    es: 'Conectado a {name} (OPNsense {version}).',
  },
  testNoDashboard: {
    en: 'Connected to OPNsense, but the API user lacks "Lobby: Dashboard": no CPU, memory, disk, temperature nor uptime. The other functions follow their own privileges.',
    fr: 'Connecté à OPNsense, mais l’utilisateur de la clé n’a pas le droit « Lobby: Dashboard » : ni CPU, mémoire, disque, température, durée. Le reste suit ses propres droits.',
    de: 'Mit OPNsense verbunden, aber dem API-Benutzer fehlt „Lobby: Dashboard“: keine CPU, Speicher, Festplatte, Temperatur, Laufzeit. Der Rest folgt seinen eigenen Rechten.',
    es: 'Conectado a OPNsense, pero al usuario de la API le falta «Lobby: Dashboard»: sin CPU, memoria, disco, temperatura ni tiempo activo. El resto sigue sus propios privilegios.',
  },
  forgotten: {
    en: 'Known devices forgotten: the next reading is the new reference, without alert.',
    fr: 'Appareils connus oubliés : la prochaine lecture sert de nouvelle référence, sans alerte.',
    de: 'Bekannte Geräte vergessen: Das nächste Lesen ist die neue Referenz, ohne Alarm.',
    es: 'Dispositivos conocidos olvidados: la próxima lectura es la nueva referencia, sin alerta.',
  },
  rebooting: {
    en: 'OPNsense is rebooting: the network is cut for a few minutes.',
    fr: 'OPNsense redémarre : le réseau est coupé quelques minutes.',
    de: 'OPNsense startet neu: Das Netzwerk ist einige Minuten unterbrochen.',
    es: 'OPNsense se está reiniciando: la red se corta unos minutos.',
  },
  unknownAction: {
    en: 'Unknown action.',
    fr: 'Action inconnue.',
    de: 'Unbekannte Aktion.',
    es: 'Acción desconocida.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('gatewayDeviceName', 'fr', { name: 'WAN_DHCP' }); // -> 'Passerelle WAN_DHCP'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testOk', { name: 'fw.home.lan', version: '26.7.7' });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
