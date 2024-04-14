import style from '../dom/style.css';

import * as ManifoldClient from '../js/ManifoldClient';

function injector(src) {
  src = src.replace(
    /;(([^\]]{0,10}\])=\{\};)(.{0,1000}\2.{0,500}=\[\];.{0,500}=true.{0,500}=Date)/gm,
    ';$1window.manifold.localPlayerData = $2;$3',
  );

  src = src.replace(
    /;(([^\}\[]{0,10})[^;=]{0,100}=fun.{0,1000}gd:.{0,100}fl:false)/gm,
    ';window.manifold.mapEncoder = $2;$1',
  );

  src = src.replace(
    /([A-Za-z0-9_$]{3}\[[0-9]{0,10}\])(=class.{0,1000};)(\1.{0,200}\1.{0,200}lobbyName)/m,
    '$1$2window.manifold.modeList = $1;$3',
  );

  src = src.replace(
    /(requirejs.{0,100}function\(.{0,100}";)/gm,
    [
      '$1(() => {',
      '  const ioOLD = arguments[0];',
      '  arguments[0] = function() {',
      '    window.manifold.handleIOCtorArgs(arguments);',
      '    const instance = ioOLD.apply(this, arguments);',
      '    instance.emitOLD_tps = instance.emit;',
      '    instance.emit = function() {',
      '      window.manifold.handleIOEmitArgs(arguments);',
      '      return instance.emitOLD_tps(...arguments);',
      '    };',
      '    instance.onOLD_tps = instance.on;',
      '    instance.on = function() {',
      '      window.manifold.handleIOOnArgs(arguments);',
      '      return instance.onOLD_tps(...arguments);',
      '    };',
      '    return instance;',
      '  };',
      '  const peerOLD = arguments[1].peerjs.Peer;',
      '  arguments[1].peerjs.Peer = function() {',
      '    if (window.manifold.active) {',
      '      return window.manifold.fakePeerInstance;',
      '    } else {',
      '      return new peerOLD(...arguments);',
      '    }',
      '  };',
      '})();',
    ].join(''),
  );

  src = src.replace(
    /(function ([^\(]+).{0,500}\(\);for.{0,2000}a:for)/m,
    [
      '(() => {',
      '  const fnOLD = $2;',
      '  $2 = function() {',
      '    fnOLD(...arguments);',
      '    window.manifold.afterRoomListLoad();',
      '  }',
      '})();$1',
    ].join(''),
  );

  src = src.replace(/([}]+?([\)]+)?;?)(function .{5,8}\(\)\{retur|$)/, 'window.manifold.init();$1$3');

  window.manifold = ManifoldClient;

  return src;
}

if (!window.bonkCodeInjectors) window.bonkCodeInjectors = [];
window.bonkCodeInjectors.push((bonkCode) => {
  try {
    return injector(bonkCode);
  } catch (error) {
    alert(
      `Whoops! Manifold Client was unable to load.
This may be due to an update to Bonk.io. If so, please report this error!
This could also be because you have an extension that is incompatible with \
this mod. You would have to disable it to use \
Manifold Client.`,
    );
    throw error;
  }
});

const styleElement = document.createElement('style');
styleElement.innerHTML = style;
document.head.appendChild(styleElement);
