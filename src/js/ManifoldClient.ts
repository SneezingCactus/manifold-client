export const sanitizerElement = document.createElement('div');

export let roomListElements: Record<string, HTMLElement>;

export let statusChatMessage: (content: string, colour: string) => void;
export let localPlayerData: any;
export let mapEncoder: any;
export let modeList: any;

export let active = false;

export let serverEntries: any[] = [];
export let serverUrls: string[] = [];

export let fetchControllers: AbortController[] = [];

export const fakePeerInstance = {
  // this fake peer instance was taken from kklkkj's Disable P2P mod
  // (https://greasyfork.org/en/scripts/437812-bonk-io-disable-p2p)
  // huge shoutouts to kkl of course
  destroy: () => {},
  on: (eventName: string, callback: (status: string) => void) => {
    if (eventName == 'open') setTimeout(() => callback('invalid'), 0);
  },
  connect: (_peerID: string) => {
    return {
      on: function () {},
      open: false,
    };
  },
};

export function handleIOInstance(instance: any) {
  instance.on('mfold_chatstatus', (message: string, colour: string) => {
    statusChatMessage(message, colour);
  });
}

export function handleIOCtorArgs(args: any[]) {
  if (!active) return;

  const serverId = args[0].slice(8, -9); // removes bonk.io part of url

  args[0] = serverId;
  args[1].secure = false;
}

export function handleIOOnArgs(args: any[]) {
  const cbOLD = args[1];

  // Bonk, for some reason, prints these server messages using
  // innerHTML, meaning without previous sanitization, servers
  // would be able to perform XSS attacks. Granted, this isn't a
  // problem in Vanilla Bonk because the official servers are
  // trustful, but it certainly is a problem for third party
  // servers.

  // "server error message" packet
  if (args[0] == 16) {
    args[1] = function (message: string) {
      sanitizerElement.innerText = message;
      return cbOLD(sanitizerElement.innerHTML);
    };
  }

  if (!active) return;

  // When you gain XP, the client sends a packet requesting the server
  // to add 100xp to your account, then the server replies with a packet
  // containing your total amount of XP after the 100xp are added.
  // Through this packet, the server can also reassign a client's token,
  // which, even though useful in vanilla bonk servers, as tokens are
  // temporary and must be renewed, it's unwanted in third party servers
  // because players can be unwillingly and unknowingly logged into a
  // different account.

  // "gained xp" packet
  if (args[0] == 46) {
    args[1] = function (data: any) {
      delete data.newToken;
      return cbOLD(data);
    };
  }

  // Vanilla Bonk sends map data in these packets in their raw form,
  // as opposed to every other map-related packet, where map data is
  // sent in their encoded form.
  //
  // Manifold changes this behaviour to allow the server
  // to handle these packets by itself when no host is present in the
  // room.

  // "inform in lobby" packet
  if (args[0] == 21) {
    args[1] = function (data: any) {
      data.map = mapEncoder.decodeFromDatabase(data.map);
      return cbOLD(data);
    };
  }
}

export function handleIOEmitArgs(args: any[]) {
  if (!active) return;

  // This packet is sent to the server when joining. It contains some
  // authentication and player info, such as the player's avatar and
  // the server password (as entered by the player).
  //
  // When you join a server as a registered account, the client includes
  // its token inside this packet. The token is then used by the server
  // to fetch the player's username and level. However, the token can
  // also be used for malicious purposes such as changing the account's
  // skin, creating/deleting maps, joining rooms as the player, etc.
  //
  // To prevent servers from tampering with accounts, Manifold strips
  // out the token and instead sends the player's username and
  // level directly.
  if (args[0] == 13) {
    args[1].token = null;
    args[1].userName = localPlayerData.userName;
    args[1].level = localPlayerData.level();
  }

  if (args[0] == 11) {
    args[1].gs = { ...args[1].gs };

    args[1].gs.map = mapEncoder.encodeToDatabase(args[1].gs.map);
  }
}

export function fetchServerData(callback: (serverData: any) => void) {
  for (const controller of fetchControllers) {
    controller.abort();
  }
  fetchControllers = [];

  const rooms = [];

  for (let i = 0; i < serverUrls.length; i++) {
    const server = serverUrls[i];
    const index = i;

    delete serverEntries[i];

    rooms.push({
      country: 'US',
      id: server,
      ingame: 0,
      latitude: 0,
      longitude: 0,
      maxlevel: 0,
      maxplayers: '',
      minlevel: 0,
      mode_ga: 'b',
      mode_mo: 'b',
      password: 0,
      players: 0,
      roomname: server,
      closed: false,
      version: localPlayerData.version,
      metadataLoaded: false,
    });

    const timeBeforeFetch = Date.now();

    const controller = new AbortController();

    fetchControllers.push(controller);

    fetch(server, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();

        data.metadataLoaded = true;

        // to filter out urls that lead to a json but aren't bonk servers
        if (!data.isBonkServer) {
          data.ping = -3;

          updateRoomListEntry(index, data);
          return;
        }

        data.ping = Date.now() - timeBeforeFetch;

        data.country = 'US';
        data.id = server;
        data.index = i;
        data.latitude = 0;
        data.longitude = 0;
        data.minlevel = 0;
        data.maxlevel = 999;
        data.version = localPlayerData.version;

        // client-side limits for roomlist entry params that are visible to the user
        data.roomname = data.roomname?.slice(0, 1000);
        data.players = data.players?.toString().slice(0, 1000);
        data.maxplayers = data.maxplayers?.toString().slice(0, 1000);

        updateRoomListEntry(index, data);
      })
      .catch((e) => {
        updateRoomListEntry(index, {
          ping: e.message.includes('valid JSON') ? -3 : -2,
          metadataLoaded: true,
        });
      });
  }

  serverEntries = rooms;

  callback({
    country: '',
    createserver: '',
    friends: [],
    lat: 0,
    long: 0,
    rooms: rooms,
  });
}

export function updateRoomListEntry(serverIndex: number, data: any) {
  const entry = roomListElements.roomListTable.querySelector(`tr[data-myid='${serverIndex}']`) as HTMLTableRowElement;

  if (!entry) return;

  serverEntries[serverIndex] = { ...serverEntries[serverIndex], ...data };

  const pingCell = entry.cells[entry.cells.length - 1];

  if (data.closed) {
    pingCell.innerText = 'Closed';
  } else if (data.ping >= 0) {
    entry.cells[0].innerText = data.roomname;
    entry.cells[1].innerText = `${data.players}/${data.maxplayers}`;
    entry.cells[2].innerText = modeList.modes[data.mode_mo]?.lobbyName ?? 'Unknown';
    entry.cells[4].innerText = '';
    pingCell.innerText = `${data.ping}ms`;

    if (data.password) {
      const passwordIcon = document.createElement('img');
      passwordIcon.src = 'graphics/lock.png';
      passwordIcon.style.marginTop = '4px';
      entry.cells[3].appendChild(passwordIcon);
    }
  } else if (data.ping == -2) {
    pingCell.innerText = 'Unreachable';
  } else if (data.ping == -3) {
    pingCell.innerText = 'Invalid';
  }
}

export function afterRoomListLoad() {
  if (!active) return;

  const entries = roomListElements.roomListTable.getElementsByTagName('tr');

  for (const entry of entries) {
    const data = serverEntries[parseInt(entry.getAttribute('data-myid') as string)];

    entry.addEventListener('mouseover', function () {
      const data = serverEntries[parseInt(entry.getAttribute('data-myid') as string)];
      if (!data?.id) return;
      entry.cells[0].innerText = data.id;
    });

    entry.addEventListener('mouseleave', function () {
      const data = serverEntries[parseInt(entry.getAttribute('data-myid') as string)];
      if (!data?.roomname) return;
      entry.cells[0].innerText = data.roomname;
    });

    // delete country cell
    entry.deleteCell(-1);

    // delete "JOINED" indicator
    entry.cells[0].querySelector('.roomlisttablejoined')?.remove();

    entry.cells[1].innerText = '';
    entry.cells[2].innerText = '';
    entry.cells[4].innerText = '';

    const pingCell = entry.cells[entry.cells.length - 1];

    pingCell.style.width = '12%';
    pingCell.style.boxSizing = 'border-box';
    pingCell.style.paddingRight = '20px';
    pingCell.innerText = 'Pinging...';

    if (!data?.metadataLoaded) continue;

    if (data.ping >= 0) {
      entry.cells[1].innerText = `${data.players}/${data.maxplayers}`;
      entry.cells[2].innerText = modeList.modes[data.mode_mo]?.lobbyName ?? 'Unknown';
      entry.cells[4].innerText = '';
      pingCell.innerText = `${data.ping}ms`;
    } else if (data.ping == -2) {
      pingCell.innerText = 'Unreachable';
    } else if (data.ping == -3) {
      pingCell.innerText = 'Invalid';
    }
  }
}

export function init() {
  serverUrls = JSON.parse(localStorage.getItem('manifoldClientServers') ?? '[]');

  const postOLD = (window as any).$.post;
  (window as any).$.post = function () {
    if (!active) return postOLD(...arguments);

    if (arguments[0].endsWith('getrooms.php')) {
      return {
        done: function (callback: (data: any) => void) {
          fetchServerData(callback);

          return {
            fail: function () {
              return this;
            },
          };
        },
      };
    } else if (arguments[0].endsWith('getroomaddress.php')) {
      const id = arguments[1].id;
      return {
        done: function (callback: (data: any) => void) {
          callback({
            r: 'success',
            id: id,
            server: id,
            address: 0,
          });

          return this;
        },
        fail: function () {
          return this;
        },
      };
    }

    return postOLD(...arguments);
  };

  roomListElements = {
    roomList: document.getElementById('roomlist') as HTMLElement,
    roomListTable: document.getElementById('roomlisttable') as HTMLElement,
    refreshButton: document.getElementById('roomlistrefreshbutton') as HTMLElement,
    createButton: document.getElementById('roomlistcreatebutton') as HTMLElement,
    createWindow: document.getElementById('roomlistcreatewindow') as HTMLElement,
    createWindowLabel1: document.getElementById('roomlistcreatewindowlabel1') as HTMLElement,
    createWindowLabel2: document.getElementById('roomlistcreatewindowlabel2') as HTMLElement,
    createWindowLabel3: document.getElementById('roomlistcreatewindowlabel3') as HTMLElement,
    createWindowLabel4: document.getElementById('roomlistcreatewindowlabel4') as HTMLElement,
    createWindowLabel5: document.getElementById('roomlistcreatewindowlabel5') as HTMLElement,
    createWindowGameName: document.getElementById('roomlistcreatewindowgamename') as HTMLInputElement,
    createWindowPassword: document.getElementById('roomlistcreatewindowpassword') as HTMLElement,
    createWindowMaxPlayers: document.getElementById('roomlistcreatewindowmaxplayers') as HTMLElement,
    createWindowMinLevel: document.getElementById('roomlistcreatewindowminlevel') as HTMLElement,
    createWindowMaxLevel: document.getElementById('roomlistcreatewindowmaxlevel') as HTMLElement,
    createWindowUnlisted: document.getElementById('roomlistcreatewindowunlisted') as HTMLElement,
    createWindowContainer: document.getElementById('roomlistcreatewindowcontainer') as HTMLElement,
    createWindowTopText: document.getElementById('roomlistcreatewindowtoptext') as HTMLElement,
    createWindowCreateButton: document.getElementById('roomlistcreatecreatebutton') as HTMLElement,
    createWindowCloseButton: document.getElementById('roomlist_create_close') as HTMLElement,
    lobbyLinkButton: document.getElementById('newbonklobby_linkbutton') as HTMLElement,
    hostLeaveGameEndRoomButton: document.getElementById('hostleaveconfirmwindow_endbutton') as HTMLElement,
    mapVoteWindowFade: document.getElementById('newbonklobby_votewindow_fade') as HTMLElement,
    mapVoteWindow: document.getElementById('newbonklobby_votewindow') as HTMLElement,
  };

  const tabContainer = document.createElement('div');
  const officialTab = document.createElement('div');
  const manifoldTab = document.createElement('div');
  const buttonContainer = document.createElement('div');
  const addButton = document.createElement('div');
  const deleteButton = document.createElement('div');
  const moveUpButton = document.createElement('div');
  const moveDownButton = document.createElement('div');
  const dialogAddButton = document.createElement('div');

  tabContainer.classList.add('manifold_roomlisttabcontainer');
  officialTab.classList.add('manifold_roomlisttab', 'windowTopBar', 'windowTopBar_classic');
  manifoldTab.classList.add('manifold_roomlisttab', 'windowTopBar', 'windowTopBar_classic', 'inactive');
  buttonContainer.classList.add('manifold_roomlistbuttoncontainer');
  addButton.classList.add('brownButton', 'brownButton_classic', 'buttonShadow', 'manifold_roomlistbutton');
  deleteButton.classList.add('brownButton', 'brownButton_classic', 'buttonShadow', 'manifold_roomlistbutton');
  moveUpButton.classList.add('brownButton', 'brownButton_classic', 'buttonShadow', 'manifold_roomlistbutton');
  moveDownButton.classList.add('brownButton', 'brownButton_classic', 'buttonShadow', 'manifold_roomlistbutton');
  dialogAddButton.classList.add('roomlistcreatebottombutton', 'brownButton', 'brownButton_classic', 'buttonShadow');
  dialogAddButton.style.visibility = 'hidden';

  officialTab.innerText = 'Official';
  manifoldTab.innerText = 'Manifold';
  tabContainer.appendChild(officialTab);
  tabContainer.appendChild(manifoldTab);

  addButton.innerText = 'Add';
  deleteButton.innerText = 'Delete';
  moveUpButton.innerText = 'Move up';
  moveDownButton.innerText = 'Move down';
  dialogAddButton.innerText = 'Add';
  buttonContainer.appendChild(addButton);
  buttonContainer.appendChild(deleteButton);
  buttonContainer.appendChild(moveUpButton);
  buttonContainer.appendChild(moveDownButton);

  roomListElements.roomList.prepend(tabContainer);
  roomListElements.roomList.prepend(buttonContainer);

  roomListElements.createWindow.appendChild(dialogAddButton);

  localPlayerData.setButtonSounds([addButton, deleteButton, moveUpButton, moveDownButton, dialogAddButton]);

  // BEHOLD! jank!
  // this code turns the Create Game dialog window into an Add Server dialog window and vice versa
  // I didn't make a new window because of issues related to theming (w/ Bonk Themes or BLC)
  manifoldTab.addEventListener('click', function () {
    active = true;
    roomListElements.refreshButton.click();

    officialTab.classList.add('inactive');
    manifoldTab.classList.remove('inactive');
    buttonContainer.style.visibility = 'visible';
    roomListElements.createButton.style.visibility = 'hidden';
    roomListElements.createWindowLabel2.style.visibility = 'hidden';
    roomListElements.createWindowLabel3.style.visibility = 'hidden';
    roomListElements.createWindowLabel4.style.visibility = 'hidden';
    roomListElements.createWindowLabel5.style.visibility = 'hidden';
    roomListElements.createWindowPassword.style.visibility = 'hidden';
    roomListElements.createWindowMaxPlayers.style.visibility = 'hidden';
    roomListElements.createWindowMinLevel.style.visibility = 'hidden';
    roomListElements.createWindowMaxLevel.style.visibility = 'hidden';
    roomListElements.createWindowUnlisted.style.visibility = 'hidden';
    roomListElements.createWindowContainer.style.height = '163px';
    roomListElements.createWindowTopText.innerText = 'Add Server';
    roomListElements.createWindowLabel1.innerText = 'Server URL';
    roomListElements.createWindowCreateButton.style.visibility = 'hidden';
    dialogAddButton.style.visibility = 'inherit';

    roomListElements.lobbyLinkButton.classList.add('brownButtonDisabled');
    roomListElements.hostLeaveGameEndRoomButton.classList.add('brownButtonDisabled');
    roomListElements.mapVoteWindowFade.style.visibility = 'hidden';
    roomListElements.mapVoteWindow.style.visibility = 'hidden';
  });

  officialTab.addEventListener('click', function () {
    active = false;
    roomListElements.refreshButton.click();

    officialTab.classList.remove('inactive');
    manifoldTab.classList.add('inactive');
    buttonContainer.style.visibility = 'hidden';
    roomListElements.createButton.style.visibility = 'visible';

    roomListElements.createWindowLabel2.style.visibility = 'inherit';
    roomListElements.createWindowLabel3.style.visibility = 'inherit';
    roomListElements.createWindowLabel4.style.visibility = 'inherit';
    roomListElements.createWindowLabel5.style.visibility = 'inherit';
    roomListElements.createWindowPassword.style.visibility = 'inherit';
    roomListElements.createWindowMaxPlayers.style.visibility = 'inherit';
    roomListElements.createWindowMinLevel.style.visibility = 'inherit';
    roomListElements.createWindowMaxLevel.style.visibility = 'inherit';
    roomListElements.createWindowUnlisted.style.visibility = 'inherit';
    roomListElements.createWindowContainer.style.height = '363px';
    roomListElements.createWindowTopText.innerText = 'Create Game';
    roomListElements.createWindowLabel1.innerText = 'Game name';
    roomListElements.createWindowCreateButton.style.visibility = 'inherit';
    dialogAddButton.style.visibility = 'hidden';

    roomListElements.lobbyLinkButton.classList.remove('brownButtonDisabled');
    roomListElements.hostLeaveGameEndRoomButton.classList.remove('brownButtonDisabled');
    roomListElements.mapVoteWindowFade.style.visibility = 'inherit';
    roomListElements.mapVoteWindow.style.visibility = 'inherit';
  });

  addButton.addEventListener('click', function () {
    roomListElements.createButton.click();
    (roomListElements.createWindowGameName as HTMLInputElement).value = '';
  });

  deleteButton.addEventListener('click', function () {
    const selectedRow = roomListElements.roomListTable.querySelector('.SELECTED');
    if (!selectedRow) return;

    const indexToDelete = parseInt(selectedRow.getAttribute('data-myid') as string);

    serverUrls.splice(indexToDelete, 1);
    serverEntries.splice(indexToDelete, 1);
    selectedRow.remove();

    const entries = roomListElements.roomListTable.getElementsByTagName('tr');

    for (const entry of entries) {
      const index = parseInt(entry.getAttribute('data-myid') as string);
      if (index > indexToDelete) entry.setAttribute('data-myid', (index - 1).toString());
    }

    localStorage.setItem('manifoldClientServers', JSON.stringify(serverUrls));
  });

  moveUpButton.addEventListener('click', function () {
    const selectedRow = roomListElements.roomListTable.querySelector('.SELECTED');
    if (!selectedRow || !selectedRow.previousElementSibling) return;

    const serverUrlIndex = parseInt(selectedRow.getAttribute('data-myid') as string);

    serverUrls.splice(serverUrlIndex - 1, 0, serverUrls.splice(serverUrlIndex, 1)[0]);
    serverEntries.splice(serverUrlIndex - 1, 0, serverEntries.splice(serverUrlIndex, 1)[0]);

    selectedRow.setAttribute('data-myid', (serverUrlIndex - 1).toString());
    selectedRow.previousElementSibling.setAttribute('data-myid', serverUrlIndex.toString());

    selectedRow.after(selectedRow.previousElementSibling);

    localStorage.setItem('manifoldClientServers', JSON.stringify(serverUrls));
  });

  moveDownButton.addEventListener('click', function () {
    const selectedRow = roomListElements.roomListTable.querySelector('.SELECTED');
    if (!selectedRow || !selectedRow.nextElementSibling) return;

    const serverUrlIndex = parseInt(selectedRow.getAttribute('data-myid') as string);

    serverUrls.splice(serverUrlIndex + 1, 0, serverUrls.splice(serverUrlIndex, 1)[0]);
    serverEntries.splice(serverUrlIndex + 1, 0, serverEntries.splice(serverUrlIndex, 1)[0]);

    selectedRow.setAttribute('data-myid', (serverUrlIndex + 1).toString());
    selectedRow.nextElementSibling.setAttribute('data-myid', serverUrlIndex.toString());

    selectedRow.before(selectedRow.nextElementSibling);

    localStorage.setItem('manifoldClientServers', JSON.stringify(serverUrls));
  });

  dialogAddButton.addEventListener('click', function (e) {
    serverUrls.push((roomListElements.createWindowGameName as HTMLInputElement).value);
    roomListElements.refreshButton.click();
    roomListElements.createWindowCloseButton.click();

    localStorage.setItem('manifoldClientServers', JSON.stringify(serverUrls));
  });
}
