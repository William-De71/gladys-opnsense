# OPNsense

## Presentación

Esta integración trae su cortafuegos **OPNsense** a Gladys, mediante la API de OPNsense en su red local:

- un dispositivo **cortafuegos**: uso de CPU, memoria y disco, temperatura, tiempo en marcha, actualizaciones pendientes, versión y pares WireGuard conectados;
- un dispositivo por **puerta de enlace** (estado, latencia, pérdida de paquetes) y por **interfaz** (velocidades recibida y enviada, enlace, dirección IPv4);
- las **reglas del cortafuegos** de la categoría que elija, como interruptores: active o desactive una regla desde un panel o una escena;
- los **dispositivos de su red** (teléfonos, ordenadores…) como sensores de presencia, a partir de la tabla ARP y de las concesiones DHCP;
- **escenas**: puerta de enlace caída, alguien ha llegado a casa, nuevo dispositivo en la red, conexión VPN, servicio detenido, actualización disponible; y acciones para despertar un ordenador, bloquear un dispositivo, reiniciar un servicio, buscar actualizaciones o reiniciar;
- cuatro **widgets de panel**.

![Los cuatro widgets de la integración: vista del cortafuegos, conexión a internet, dispositivos de red y VPN WireGuard (ilustración generada, no es una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-opnsense/main/docs/assets/widgets.es.png)

Todo se queda en su red: la integración solo habla con OPNsense, nunca con una nube.

## Requisitos previos

- Gladys Assistant 5.1.0 o posterior.
- OPNsense 25.1 o posterior (escrita a partir de la API de OPNsense 26.7), accesible desde el equipo de Gladys.
- Un usuario de OPNsense dedicado a Gladys, con una clave de API. Créelo en **Sistema > Acceso > Usuarios** y dele los privilegios de las funciones que quiera (campo **Privilegios**):

| Función                                                                        | Privilegio de OPNsense                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Cortafuegos (nombre, versión, CPU, memoria, disco, temperatura, tiempo activo) | Lobby: Dashboard                                                     |
| Puertas de enlace                                                              | System: Gateways                                                     |
| Interfaces                                                                     | Status: Interfaces, Reporting: Traffic                               |
| Dispositivos de red                                                            | Diagnostics: ARP Table, y Services: Dnsmasq DNS/DHCP o DHCP: Kea(v4) |
| WireGuard                                                                      | VPN: WireGuard: Status                                               |
| Servicios (disparador, reinicio)                                               | Status: Services                                                     |
| Actualizaciones (búsqueda)                                                     | System: Firmware                                                     |
| Interruptores de reglas                                                        | Firewall: Rules [new], Firewall: Categories                          |
| Acción sobre los alias                                                         | Diagnostics: PF Table IP addresses                                   |
| Reinicio                                                                       | Diagnostics: Reboot System                                           |
| Wake-on-LAN (plugin os-wol)                                                    | Services: Wake on LAN                                                |

Un privilegio no concedido simplemente desactiva su función, «Lobby: Dashboard» incluido: las puertas de enlace, las interfaces y los dispositivos de la red funcionan sin él. «System: Firmware» también permite instalar actualizaciones por la API: concédalo solo si quiere la búsqueda de actualizaciones. Los nombres de los privilegios son los de la interfaz en inglés de OPNsense.

En la página del usuario, sección **Claves de API**, pulse **+**: se descarga un archivo `key.txt`, con una línea `key=` y una línea `secret=`.

## Configuración

En Gladys, abra **Integraciones > OPNsense**, instálela y rellene:

| Campo                         | Qué introducir                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dirección de OPNsense         | La dirección de la interfaz web, por ejemplo `https://192.168.1.1` (añada el puerto si no es el 443).               |
| Clave de API                  | La línea `key=` de `key.txt`.                                                                                       |
| Secreto de la API             | La línea `secret=` de `key.txt`. No se vuelve a mostrar ni se escribe en los registros.                             |
| Verificar el certificado      | Déjelo sin marcar con el certificado autofirmado de OPNsense; márquelo con un certificado válido.                   |
| Intervalo de lectura          | De 10 a 300 segundos, 30 por defecto.                                                                               |
| Dispositivos de red ofrecidos | Los dispositivos ofrecidos en el descubrimiento: los que tienen nombre (por defecto), todos o ninguno.              |
| Retardo de ausencia           | Minutos sin respuesta antes de que un dispositivo esté ausente, 5 por defecto.                                      |
| Categoría de las reglas       | Las reglas del cortafuegos de esta categoría se convierten en interruptores (`gladys` por defecto; vacío: ninguna). |
| Idioma de los textos          | Idioma de los nombres, estados y resúmenes de escenas; automático sigue su panel.                                   |

Pulse **Probar la conexión**: Gladys muestra el nombre y la versión de su OPNsense.

## Uso

### Dispositivos

Abra **Integraciones > OPNsense > Descubrimiento** y añada los dispositivos que quiera. Nada se crea sin usted.

| Dispositivo            | Funciones                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OPNsense (cortafuegos) | Uso de CPU, memoria y disco (%), temperatura, tiempo en marcha (días), actualizaciones pendientes, versión, pares VPN         |
| Puerta de enlace       | Estado (en línea, sin conexión, degradada, pendiente), latencia (ms), pérdida de paquetes (%)                                 |
| Interfaz               | Velocidades recibida y enviada (Mbit/s, vistas desde la interfaz: en la WAN, recibido es la descarga), enlace, dirección IPv4 |
| Regla                  | Activada: un interruptor                                                                                                      |
| Dispositivo de red     | Presencia                                                                                                                     |

### Presencia de los dispositivos

Un dispositivo de su red está **presente** en cuanto responde en la tabla ARP de OPNsense, y **ausente** cuando lleva fuera el retardo de ausencia. El sensor de presencia envía 1 cada minuto mientras el dispositivo está, como la presencia Bluetooth de Gladys: úselo en la acción de escena **Comprobar presencia del usuario** para saber si alguien está en casa. Un teléfono con dirección Wi-Fi privada (aleatoria) solo conserva la misma dirección en su red si la opción se fija por red: compruébelo en el teléfono.

### Reglas del cortafuegos

En OPNsense, abra **Cortafuegos > Reglas**, edite una regla (por ejemplo «Bloquear la tableta de los niños») y asígnele la categoría `gladys` (créela en **Cortafuegos > Categorías**). Tras un descubrimiento, la regla aparece como un interruptor: encendido activa la regla, apagado la desactiva, y OPNsense aplica el cambio al instante. Solo se pueden conmutar las reglas del nuevo editor de reglas, no las reglas automáticas.

### Widgets del panel

- **Cortafuegos OPNsense**: indicadores de CPU, memoria y disco, temperatura, puertas de enlace, tiempo en marcha, actualizaciones, y dos botones: buscar actualizaciones y reiniciar (con confirmación).
- **Conexión a internet**: latencia, pérdida de paquetes, descarga y subida de una puerta de enlace y una interfaz (la WAN por defecto), con el gráfico del tráfico en cuanto se añade el dispositivo de la interfaz.
- **Dispositivos de red**: los dispositivos conectados ahora, los que se fueron, todos, o los nuevos (vistos por primera vez en los últimos 7 días, los más recientes primero).
- **VPN WireGuard**: los pares, conectados o no, y su último contacto.

### Escenas

Disparadores:

- **Estado de puerta de enlace cambiado**: en línea, degradada (latencia, pérdida) o sin conexión, filtrado por puerta de enlace y estado.
- **Dispositivo llegó o se fue**: para un dispositivo de red añadido en Gladys.
- **Nuevo dispositivo en la red**: una dirección MAC nunca vista, una vez por dirección. Los dispositivos presentes en el primer arranque son la referencia y no disparan nada; el botón de configuración **Olvidar dispositivos conocidos** empieza una nueva referencia.
- **Par VPN conectado o no**: un par WireGuard.
- **Servicio iniciado o detenido**: Unbound, Dnsmasq, WireGuard…
- **Actualización disponible**: una búsqueda de actualizaciones encontró novedades.

Acciones: leer el estado (CPU, puertas de enlace, dispositivos presentes… para un mensaje), despertar un dispositivo (Wake-on-LAN, plugin os-wol, a través de las VLAN), añadir o quitar una dirección de un alias, reiniciar un servicio, buscar actualizaciones, reiniciar.

Ejemplos:

- Cuando la puerta de enlace `WAN_DHCP` pasa a sin conexión → enviar un mensaje «Internet ha caído, el 4G toma el relevo».
- Cuando aparece un nuevo dispositivo en la red → enviar su nombre, fabricante y dirección IP al administrador.
- Cada noche a las 21:00 → añadir la IP de la tableta de los niños al alias `kids_block`, usado por una regla de bloqueo; quitarla a las 7:00.

### Transporte

Solo local: la integración habla con la API de OPNsense por HTTPS en su red, con la clave de API. Ningún dato sale de su red (el propio OPNsense contacta con su réplica de actualizaciones durante una búsqueda).

## Solución de problemas

- **«OPNsense rechaza la clave de API»**: vuelva a copiar la clave y el secreto desde `key.txt`, sin espacios.
- **«El certificado HTTPS es rechazado»**: desmarque «Verificar el certificado», o instale un certificado válido para la dirección introducida.
- **«le falta un privilegio»**: añada los privilegios indicados arriba al usuario de OPNsense de la clave.
- **«sin el privilegio Lobby: Dashboard»**: la integración funciona, pero el dispositivo cortafuegos queda vacío; conceda «Lobby: Dashboard» para tener su estado.
- **Ningún dispositivo de red**: compruebe el privilegio «Diagnostics: ARP Table» y la opción «Dispositivos de red ofrecidos».
- **Falta una regla**: debe llevar la categoría y proceder del nuevo editor de reglas.
- **El Wake-on-LAN falla**: instale el plugin `os-wol` en **Sistema > Firmware > Plugins**, e introduzca la interfaz (`lan`, `opt1`…) para un dispositivo nunca visto.
- **Registros**: añada la variable de entorno `DEBUG=gladys-integration-sdk` y abra una issue en [GitHub](https://github.com/William-De71/gladys-opnsense/issues) con las versiones de Gladys, de la integración y de OPNsense, y los registros (la clave de API y su secreto nunca aparecen en ellos).
