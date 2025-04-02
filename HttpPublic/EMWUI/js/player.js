let fullscreen, theater;
let readyToAutoPlay;
let VideoSrc;
const videoParams = new URLSearchParams();
const streamParams = new URLSearchParams();
let hls, cap;
let Jikkyo = localStorage.getItem('Jikkyo') == 'true';
let DataStream = localStorage.getItem('DataStream') == 'true';
vid = document.getElementById("video");
const $vid = $(vid);

if (vid.tagName == "CANVAS") vid = new class {
	#playbackRate;
	#paused;
	#muted;
	#volume;
	constructor(e){
		this.e = e;
		this.currentTime = 0;
		this.error = null;
		this.#playbackRate = 1;
		this.#paused = true;
		this.#muted = false;
		this.#volume = 1;
	}
	get tslive(){return true};
	play(){
		this.#paused = false;
		this.mod&&this.mod.resumeMainLoop();
		this.e.dispatchEvent(new Event('play'));
	};
	pause(){
		this.#paused = true;
		this.mod&&this.mod.pauseMainLoop();
		this.e.dispatchEvent(new Event('pause'));
	};
	get paused(){return this.#paused};
	set audioTrack(n){this.mod.setDualMonoMode(n)};
	get muted(){return this.#muted};
	set muted(b){
		this.#muted = b;
		this.mod&&this.mod.setAudioGain(b ? 0 : this.#volume);
		this.e.dispatchEvent(new Event('volumechange'));
	};
	get volume(){return this.#volume};
	set volume(n){
		this.#volume = Number(n);
		this.mod&&this.mod.setAudioGain(n);
		this.e.dispatchEvent(new Event('volumechange'));
	};
	get playbackRate(){return this.#playbackRate};
	set playbackRate(n){
		this.#playbackRate = Number(n);
		this.mod&&this.mod.setPlaybackRate(n);
		this.e.dispatchEvent(new Event('ratechange'));
	};
	canPlayType(s){return document.createElement('video').canPlayType(s)};

	get clientHeight(){return this.e.clientHeight};
	get clientWidth(){return this.e.clientWidth};
	get height(){return this.e.height};
	get width(){return this.e.width};
}(vid);

vid.muted = localStorage.getItem('muted') == 'true';
vid.volume = localStorage.getItem('volume') || 1;
if (vid.tslive){
	//自動再生ポリシー対策
	const muted = vid.muted;
	vid.muted = true;
	$(document).one('click', () => {
		vid.muted = muted;
		document.querySelector('#volume').MaterialSlider.change(vid.muted?0:vid.volume);
	});	
}

const getVideoTime = t => {
	if (!t && t != 0) return '--:--'
	const h = Math.floor(t / 3600);
	const m = Math.floor((t / 60) % 60);
	const s = zero(Math.floor(t % 60));
	return `${h > 0 ? `${h}:` : ''}${zero(m, h > 0 || m > 9 ? 2 : 1)}:${s}`;
}

const $player = $('#player');
const $playerUI_titlebar = $('#playerUI,#titlebar');
const $contral = $('#control .mdl-menu__container');
const $subtitles = $('#subtitles');
const $vid_meta = $('#vid-meta');
let hoverID = 0;
const hideBar = (t = 0) => {
	if (hoverID) clearTimeout(hoverID);
	hoverID = setTimeout(() => {
		if (vid.paused) return;

		$playerUI_titlebar.removeClass('is-visible');
		$contral.removeClass('is-visible');
		$player.css('cursor', 'none');
	}, t);
}
const stopTimer = () => {
	if (hoverID) clearTimeout(hoverID);
	hoverID = 0;
	$player.css('cursor', 'default');
}

vcont = document.getElementById("vid-cont");
const creatCap = () => {
	cap ??= aribb24UseSvg ? new aribb24js.SVGRenderer(aribb24Option) : new aribb24js.CanvasRenderer(aribb24Option);
	if (vid.tslive){
		cap.attachMedia(null,vcont);
	}else{
		aribb24Option.enableAutoInBandMetadataTextTrackDetection = window.Hls != undefined || !Hls.isSupported();
		cap.attachMedia(vid);
	}
	if (!$subtitles.hasClass('checked')) cap.hide();
}

const onStreamStarted = () => {
	if (DataStream && false || !$remote_control.hasClass('disabled')) toggleDataStream(true);	//一度しか読み込めないため常時読み込みはオミット
	if (Jikkyo || $danmaku.hasClass('checked')) $danmaku.data('log') ? Jikkyolog() : toggleJikkyo();
	if (danmaku && !$danmaku.hasClass('checked')) danmaku.hide();
	creatCap();
}

const errorHLS = () => {
	$vid.removeClass('is-loadding');
	Snackbar('HLSエラー');
}

const startHLS= src => {
	if (!$('.is_cast').length) return;

	if (Hls.isSupported()){
		hls = new Hls();
		hls.loadSource(src);
		hls.attachMedia(vid);
		hls.on(Hls.Events.MANIFEST_PARSED, onStreamStarted);
		hls.on(Hls.Events.FRAG_PARSING_METADATA, (each, data) => data.samples.forEach(d => cap.pushID3v2Data(d.pts, d.data)));
	}else if(vid.canPlayType('application/vnd.apple.mpegurl')){
		vid.src = src;
	}
}

const resetVid = reload => {
	if (hls) hls.destroy();
	if (cap) cap.detachMedia();
	if (vid.stop) vid.stop();
	toggleDataStream(false);
	toggleJikkyo(false);
	if (reload) return;
	vid.src = '';
	$vid_meta.attr('src', '');
	VideoSrc = null;
}

const reloadHls = ($e = $('.is_cast')) => {
	const d = $e.data();
	if (!d) return;

	d.paused = vid.paused;
	const key = $Time_wrap.hasClass('offset') ? 'offset' : 'ofssec';
	d[key] = Math.floor($('input#seek').val());
	d[key] > 0 ? videoParams.set(key, d[key]) : videoParams.delete(key);
	$vid.addClass('is-loadding');
	resetVid(true);

	if (videoParams.has('load')){
		videoParams.set('reload', videoParams.get('load'));
		videoParams.delete('load');
	}
	loadHls();
}

const loadTslive = () => {
	var wakeLock=null;
	var seekParam="";
	function readNext(mod,reader,ret){
		if(ret&&ret.value){
			var inputLen=Math.min(ret.value.length,1e6);
			var buffer=mod.getNextInputBuffer(inputLen);
			if(!buffer){
			  setTimeout(function(){readNext(mod,reader,ret);},1000);
			  return;
			}
			buffer.set(new Uint8Array(ret.value.buffer,ret.value.byteOffset,inputLen));
			mod.commitInputData(inputLen);
			if(inputLen<ret.value.length){
				//Input the rest.
				setTimeout(function(){readNext(mod,reader,{value:new Uint8Array(ret.value.buffer,ret.value.byteOffset+inputLen,ret.value.length-inputLen)});},0);
				return;
			}
		}
		reader.read().then(function(r){
			if(r.done){
				if(wakeLock)wakeLock.release();
				vid.seekWithoutTransition=null;
				if(seekParam){
					mod.reset();
					startRead(mod);
				}
			}else{
				readNext(mod,reader,r);
			}
		}).catch(function(e){
			if(wakeLock)wakeLock.release();
			vid.seekWithoutTransition=null;
			if(seekParam){
				mod.reset();
				startRead(mod);
			}
			throw e;
		});
	}

	function startRead(mod){
		var ctrl=new AbortController();
		var uri=VideoSrc+seekParam;
		seekParam="";
		fetch(uri,{signal:ctrl.signal}).then(function(response){
			if(!response.ok)return;
			//Reset caption
			onStreamStarted();
			mod.setAudioGain(vid.muted?0:vid.volume);
			vid.currentTime=0;
			vid.seekWithoutTransition=function(ofssec){
				vid.seekWithoutTransition=null;
				seekParam="&ofssec="+ofssec;
				ctrl.abort();
			};
			vid.stop = () => {
				vid.pause();
				mod.reset();
				ctrl.abort();
				navigator.gpu.requestAdapter().then(adapter=>adapter.requestDevice().then(device=>vid.e.getContext("webgpu").configure({device: device,format: navigator.gpu.getPreferredCanvasFormat(),alphaMode: "premultiplied",})))
			};
			readNext(mod,response.body.getReader(),null);
			//Prevent screen sleep
			navigator.wakeLock.request("screen").then(function(lock){wakeLock=lock;});
		});
	}
	if(!window.createWasmModule){
		vid.error = {code: 0, message: 'Probably ts-live.js not found.'};
		vid.e.dispatchEvent(new Event('error'));
		return;
	}
	if(!navigator.gpu){
		vid.error = {code: 0, message: 'WebGPU not available.'};
		vid.e.dispatchEvent(new Event('error'));
		return;
	}
	navigator.gpu.requestAdapter().then(function(adapter){
		adapter.requestDevice().then(function(device){
			createWasmModule({preinitializedWebGPUDevice:device}).then(function(mod){
				vid.mod = mod;
				vid.error = null;
				let done;
				var statsTime=0;
				mod.setCaptionCallback(function(pts,ts,data){
					if(cap)cap.pushRawData(statsTime+ts,data.slice());
				});
				mod.setAudioGain(1);	//一発目無効対策
				mod.setStatsCallback(function(stats){
					if(statsTime!=stats[stats.length-1].time){
						vid.currentTime+=stats[stats.length-1].time-statsTime;
						statsTime=stats[stats.length-1].time;
						vid.e.dispatchEvent(new Event('timeupdate'));
						if(cap)cap.onTimeupdate(statsTime);
					}
					if (done) return;
					vid.e.dispatchEvent(new Event('canplay'));
					done = true;
				});
				if(vid.playbackRate != 1) mod.setPlaybackRate(vid.playbackRate);

				setTimeout(function(){
					startRead(mod);
				},500);
			});
		});
	}).catch(function(e){
		Snackbar(e.message);
		throw e;
	});
}

const $audio = $('#audio');
const $cinema = $('#cinema');
const $remote = $('#remote');
const $remote_control = $('.remote-control');
const $danmaku = $('#danmaku');
const loadHls = () => {
	let dateNow = new Date();
	dateNow = (dateNow.getHours()*60+dateNow.getMinutes())*60+dateNow.getSeconds();
	const hls1 = `&hls=${1+dateNow}`;
	if (!videoParams.has('reload')) videoParams.set('load', dateNow);	//最初にユニークな値をつくりリロード時に値を引きつぐ

	const interval = onDataStream ? 5*1000 : 0;	//データ放送切ってから一定期間待たないと動画が出力されない？
	if (window.Hls != undefined){
		//Android版Firefoxは非キーフレームで切ったフラグメントMP4だとカクつくので避ける
		setTimeout(() => waitForHlsStart(`${VideoSrc}&${videoParams.toString()}${hls1}${/Android.+Firefox/i.test(navigator.userAgent)?'':hls4}`, `ctok=${ctok}&open=1`, 200, 500, () => errorHLS(), src => startHLS(src)), interval);
		//AndroidはcanPlayTypeが空文字列を返さないことがあるが実装に個体差が大きいので避ける
	}else if(ALLOW_HLS&&!/Android/i.test(navigator.userAgent)&&vid.canPlayType('application/vnd.apple.mpegurl')){
		//環境がないためテスト出来ず
		setTimeout(() => waitForHlsStart(`${VideoSrc}&${videoParams.toString()}${hls1}${hls4}`, `ctok=${ctok}&open=1`, 200, 500, () => errorHLS(), src => vid.src=src), interval);
	}else{
		vid.src = VideoSrc;
	}
}

const checkTslive = path => {
	const url = new URL(location.href);
	const isTs = !path || /\.(?:m?ts|m2ts?)$/.test(path);
	const tslive = isTs && $(`#${localStorage.getItem('quality')}`).hasClass('tslive');
	if (!vid.tslive && tslive){
		url.searchParams.set('tslive', 1);
		history.replaceState(null, null, url);
		location.reload();
		return true;
	}else if (vid.tslive && !tslive){
		url.searchParams.delete('tslive');
		history.replaceState(null, null, url);
		location.reload();
		return true;
	}
}

const seek = document.querySelector('#seek');
const $seek = $(seek);
const $duration = $('.duration');
const $quality = $('.quality');
const $Time_wrap = $('.Time-wrap');
const $audios = $('.audio');
const $titlebar = $('#titlebar');
const loadMovie = ($e = $('.is_cast')) => {
	const d = $e.data();
	d.canPlay = d.path ? vid.canPlayType(`video/${d.path.match(/[^\.]*$/)}`).length > 0 : false;
	if (checkTslive(d.path)) return;

	if ($e.hasClass('item')){
		$('#playprev').prop('disabled', $e.is('.item:first'));
		$('#playnext').prop('disabled', $e.is('.item:last' ));
	}
	if ($e.hasClass('onair')){
		$('#playprev').prop('disabled', $e.is('.is-active>.onair:first'));
		$('#playnext').prop('disabled', $e.is('.is-active>.onair:last'));
	}

	resetVid();
	$vid.addClass('is-loadding');
	if ($remote.hasClass('done')){	//一度読み込んだら最後、無効化
		$remote.prop('disabled', true);
		$remote_control.addClass('disabled').find('button').prop('disabled', true);
	}

	$seek.attr('disabled', false);
	$quality.attr('disabled', d.canPlay);
	if (d.canPlay){
		const path = `${ROOT}${!d.public ? 'api/Movie?fname=' : ''}${d.path}`;
		$vid.attr('src', path);
		$vid_meta.attr('src', `${path.replace(/\.[0-9A-Za-z]+$/,'')}.vtt`);
		if (Jikkyo || $danmaku.hasClass('checked')) Jikkyolog();
		if (danmaku && !$danmaku.hasClass('checked')) danmaku.hide();
	}else{
		VideoSrc = `${ROOT}api/${d.onid ? `view?n=0&id=${d.onid}-${d.tsid}-${d.sid}&ctok=${ctok}`
		                                : `xcode?${d.path ? `fname=${d.path}` : d.id ? `id=${d.id}` : d.reid ? `reid=${d.reid}` : ''}` }`
	
		if (vid.tslive){
			VideoSrc += `&option=${videoParams.get('option')}`
			loadTslive();
		}else{
			['ofssec','offset','reload','audio2'].forEach(e => videoParams.delete(e));
			loadHls();
		}
		if (!d.meta) return;

		if (d.meta.duration){
			$duration.text(getVideoTime(d.meta.duration));
			$seek.attr('max', d.meta.duration);
		}else{
			$duration.text(getVideoTime());
			$seek.attr('max', 100)
		};
		$Time_wrap.toggleClass('offset', !d.meta.duration);
	    if (d.meta.audio) $audios.attr('disabled', d.meta.audio == 1);
	}

	$titlebar.html(d.name || (!(`${d.onid}-${d.tsid}-${d.sid}-${d.eid}` in Info.EventInfo) ? '' :
		`${ConvertService(Info.EventInfo[`${d.onid}-${d.tsid}-${d.sid}-${d.eid}`])}<span>${ConvertTitle(Info.EventInfo[`${d.onid}-${d.tsid}-${d.sid}-${d.eid}`].title)}</span>`));
}

const $currentTime_duration = $('.currentTime,.duration');
const playMovie = $e => {
	if ($e.hasClass('playing')){
		hideBar(2000);
		vid.play();
	}else{
		seek.MaterialSlider&&seek.MaterialSlider.change(0);
		$currentTime_duration.text('0:00');
		$audios.attr('disabled', true);
		$('.playing').removeClass('is_cast playing');
		$e.addClass('is_cast playing');
		loadMovie($e);
	}
}

$(window).on('load resize', () => {
	$player.toggleClass('is-small', $vid.width() < 800);
	if (fullscreen) return;

	if (theater || isSmallScreen()){
		theater = true;
		$('#movie-contner #player').prependTo('#movie-theater-contner');
	}else{
		$('#movie-theater-contner #player').prependTo('#movie-contner');
	}
});

$(function(){
	$('#autoplay').prop('checked', sessionStorage.getItem('autoplay') == 'true');
	$('#apk').prop('checked', localStorage.getItem('apk') == 'true');

	const $volume = $('#volume');
	$volume.on('mdl-componentupgraded', () => $volume.get(0).MaterialSlider.change(vid.muted ? 0 : vid.volume));
	if (!isSmallScreen()){
		$remote_control.prependTo('#apps-contener>.contener>.contener');
	}else{
		$('.remote-control .num').addClass('hidden');
		$('.remote-control,#apps-contener').prependTo('#main-column');
	}


	//閉じる
	$('.close.mdl-badge').click(() => {
		$('#popup').removeClass('is-visible');
		vid.pause();
		vid.playbackRate = 1;
	});

	const $play_icon = $('#play i');
	const $currentTime = $('.currentTime');
	const $playerUI = $('#playerUI');
	const $live = $('#live');
	$vid.on({
		'pause': () => $play_icon.text('play_arrow'),
		'play': () => $play_icon.text('pause'),
		'ended': () => {
			const autoplay = sessionStorage.getItem('autoplay') == 'true';
			if (autoplay && !$('.playing').is('.item:last')){
				$('.playing').next().click();
				$titlebar.addClass('is-visible');
			}else{
				if (autoplay && $('.playing').is('.item:last')) Snackbar('最後のファイルを再生しました');
				$playerUI.addClass('is-visible');
			}
		},
		'error': () => {
			if ($vid.attr('src') == '') return;

			$vid.removeClass('is-loadding');
			$('.is_cast').removeClass('is_cast');
			const errorcode = vid.networkState == 3  ? 5 : vid.error.code;
			Snackbar(`Error : ${[vid.error.message,'MEDIA_ERR_ABORTED','MEDIA_ERR_NETWORK','MEDIA_ERR_DECODE','MEDIA_ERR_SRC_NOT_SUPPORTED','NETWORK_NO_SOURCE'][errorcode]}`);
		},
		'volumechange': () => {
			vid.onVolumeChange();
			localStorage.setItem('volume', vid.volume);
			localStorage.setItem('muted', vid.muted);
		},
		//'ratechange': e => {if (sessionStorage.getItem('autoplay') == 'true') video.defaultPlaybackRate = this.playbackRate;},
		'canplay': () => {
			hideBar(2000);
			$vid.removeClass('is-loadding');

			const d = $('.is_cast').data();
			if (!d.paused) {
				const promise = vid.play();
				//自動再生ポリシー対策 https://developer.chrome.com/blog/autoplay?hl=ja
				if (promise !== undefined) {
					promise.catch(error => {
						vid.muted = true;
						vid.play();
						vid.onVolumeChange();
						document.querySelector('#volume').MaterialSlider.change(0);
						$(document).one('click', () => {
							vid.muted = false;
							document.querySelector('#volume').MaterialSlider.change(vid.volume);
						});			
					});
				}
			}
			if (!d.canPlay) return;

			$duration.text(getVideoTime(vid.duration));
			$seek.attr('max', vid.duration);
		},
		'timeupdate': () => {
			const d = $('.is_cast').data();
			if (!d) return;

			let currentTime;
			if (d.onid){
				currentTime = (Date.now() - d.meta.starttime) / 1000;
				seek.MaterialProgress.setProgress(currentTime / d.meta.duration * 100);
				$live.toggleClass('live', vid.duration - vid.currentTime < 2);
			}else if (d.path || d.id || d.reid){
				if ($seek.data('touched')) return;

				currentTime = vid.currentTime + (d.ofssec || 0);
				if (!$Time_wrap.hasClass('offset')) seek.MaterialSlider.change(currentTime);
			}
			$currentTime.text(getVideoTime(currentTime));
		}
	});

	$('#play').click(() => vid.paused ? vid.play() : vid.pause());
	
	const $quality_audio = $('.quality,.audio');
	const $stop = $('.stop');
	const $epginfo = $('#epginfo');
	$stop.click(() => {
		resetVid();
		const params = new URLSearchParams(location.search);
		params.delete('id');
		params.delete('play');
		history.replaceState(null,null,`${params.size>0?`?${params.toString()}`:location.pathname}`);
		$vid.removeClass('is-loadding');
		$epginfo.addClass('hidden');
		$('.is_cast').removeClass('is_cast');
		$('.playing').removeClass('playing');
		$titlebar.empty();
		$seek.hasClass('mdl-progress') ? seek.MaterialProgress.setProgress(0) : seek.MaterialSlider.change(0);
		$currentTime_duration.text('0:00');
		$seek.attr('disabled', true);
		$quality_audio.attr('disabled', true);
	});

	$seek.on({
		'touchstart mousedown': () => $seek.data('touched', true),
		'touchend mouseup': () => $seek.data('touched', false),
		'change': () => {
			const d = $('.is_cast').data();
			if (d.canPlay) return;
			if (vid.tslive){
				d.ofssec = Math.floor($seek.val());
				vid.seekWithoutTransition(d.ofssec);
			}else{
				if (d.ofssec < $seek.val() && $seek.val() < d.ofssec + vid.duration)
					vid.currentTime = $seek.val() - d.ofssec;
				else reloadHls();
			}
		},
		'input': () => {
			$currentTime.text(getVideoTime($seek.val()));
			if ($('.is_cast').data('canPlay'))vid.currentTime = $seek.val();
		}
	});

	$volume.on('input', () => {
		vid.muted = false;
		vid.volume = $volume.val();
	});

	const $volume_icon = $('#volume-icon');
	const $volume_icon_i = $('#volume-icon i');
	$volume_icon.click(() => {
		vid.muted = !vid.muted;
		$volume.get(0).MaterialSlider.change(vid.muted ? 0 : vid.volume);
	});
	vid.onVolumeChange = () => $volume_icon_i.text(`volume_${vid.muted ? 'off' : vid.volume == 0 ? 'mute' : vid.volume > 0.5 ? 'up' : 'down'}`);
	vid.onVolumeChange();

	$('#fullscreen').click(() => {
		const player = document.querySelector('#player');
		if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement){
			if (player.requestFullscreen) {
				player.requestFullscreen();
			} else if (player.msRequestFullscreen) {
				player.msRequestFullscreen();
			} else if (player.mozRequestFullScreen) {
				player.mozRequestFullScreen();
			} else if (player.webkitRequestFullscreen) {
				player.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
			}
			fullscreen = true;
			screen.orientation.lock('landscape');
			$('#fullscreen i').text('fullscreen_exit');
			$('.mdl-js-snackbar').appendTo('#player');
			$('.remote-control,#comment-control').prependTo('.player-container');
		}else{
			screen.orientation.unlock('landscape');
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen();
			} else if (document.mozCancelFullScreen) {
				document.mozCancelFullScreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			}
			fullscreen = false;
			$('#fullscreen i').text('fullscreen');
			$('.mdl-js-snackbar').appendTo('.mdl-layout');
			if(theater || isSmallScreen()){
				$remote_control.prependTo('#main-column');
				$('.remote-control .num').addClass('hidden');
			}else{
				$('#comment-control').insertAfter('#apps-contener>.contener');
				$remote_control.prependTo('#apps-contener>.contener>.contener');
			}

		}
	});
	if (document.pictureInPictureEnabled){
		document.getElementById('PIP').addEventListener('click', async () => {
			if ('documentPictureInPicture' in window) {
				$('.remote-control,#comment-control').prependTo('.player-container');
				const content = document.getElementById('player');
				const container = content.parentNode;
				$(container).height($vid.height());
				const pipWindow = await documentPictureInPicture.requestWindow();

				// Copy style sheets over from the initial document
				// so that the player looks the same.
				[...document.styleSheets].forEach((styleSheet) => {
					try {
						const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
						const style = document.createElement('style');

						style.textContent = cssRules;
						pipWindow.document.head.appendChild(style);
					} catch (e) {
						const link = document.createElement('link');

						link.rel = 'stylesheet';

						link.type = styleSheet.type;
						link.media = styleSheet.media;
						link.href = styleSheet.href;
						pipWindow.document.head.appendChild(link);
					}
				});
				pipWindow.document.body.setAttribute('id','popup');
				pipWindow.document.body.setAttribute('class','is-visible');
				pipWindow.document.body.append(content);
				
				pipWindow.addEventListener('resize', () => setbmlBrowserSize());
				pipWindow.addEventListener("pagehide", (event) => {
					const pipContent = event.target.getElementById("player");
					container.append(pipContent);
					if(theater){
						$remote_control.prependTo('#main-column');
						$('.remote-control .num').addClass('hidden');
						$('#movie-theater-contner').height('');
					}else{
						$('#comment-control').insertAfter('#apps-contener>.contener');
						$remote_control.prependTo('#apps-contener>.contener>.contener');
						$('#movie-contner').height('').width('');
					}
				});
			}else 
				vid.requestPictureInPicture();
		});
		$('#PIP_exit').click(() => documentPictureInPicture.window.close())
	}else{
		$('#PIP,#PIP_exit').hide();
	}
	$('#defult').click(() => {
		theater = true;
		$player.prependTo($('#movie-theater-contner'));
		$remote_control.prependTo('#main-column');
		$('.remote-control .num').addClass('hidden');
		setbmlBrowserSize();
	});
	$('#theater').click(() => {
		theater = false;
		$player.prependTo($('#movie-contner'));
		$remote_control.prependTo('#apps-contener>.contener>.contener');
		$('.remote-control .num').removeClass('hidden');
		setbmlBrowserSize();
	});

	$('#autoplay').change(e => {
		sessionStorage.setItem('autoplay', $(e.currentTarget).prop('checked'));
		//video.defaultPlaybackRate = $(e.currentTarget).prop('checked') ? video.playbackRate : 1;
	});

	if (localStorage.getItem('quality')) $(`#${localStorage.getItem('quality')}`).prop('checked', true);
	videoParams.set('option', localStorage.getItem('quality') ? $(`#${localStorage.getItem('quality')}`).val() : 1);
	$('[name=quality]').change(e => {
		const $e = $(e.currentTarget);
		localStorage.setItem('quality', $e.attr('id'));
		videoParams.set('option', $e.val());

		checkTslive();

		if (!$vid.data('cast') || localStorage.getItem('apk') != 'true') reloadHls();
	});
	$('[name=audio]').change(e => {
		const val = $(e.currentTarget).val();
		videoParams.set('audio2', val);
		vid.tslive ? vid.audioTrack = val : reloadHls();
	});
	$('#cinema').change(e => {
		if ($(e.currentTarget).checked()) videoParams.set('cinema', 1);
		else videoParams.delete('cinema');
		reloadHls();
	});
	const $rate = $('.rate');
	$rate.change(e => {
		const $e = $(e.currentTarget);
		const isTs = $('.is_cast').data('path') && /\.(?:m?ts|m2ts?)$/.test($('.is_cast').data('path'));
		//極力再読み込みは避けたい
		if (!vid.tslive && isTs && $e.val()>1){	
			videoParams.set('fast', $e.data('index'));
			streamParams.delete('fast');
			reloadHls();
			return;
		}else if (videoParams.has('fast')){
			videoParams.delete('fast');
			reloadHls();
		};

		vid.playbackRate = $e.val();
		streamParams.set('fast', $e.data('index'));
		openSubStream();
	});

	//TS-Live!有効時、非対応端末は画質選択無効
	$('.tslive').attr('disabled', !window.isSecureContext || !navigator.gpu);
	$('#rate1').attr('disabled', vid.tslive).parent().attr('disabled', vid.tslive);


	hideBar();
	$player_container = $('.player-container>*').not('.remote-control');
	if (!isMobile && !isTouch){
		$player_container.hover(() => {
			stopTimer();
			$playerUI.addClass('is-visible');
		}, () => hideBar());

		$player_container.mousemove(() => {
			stopTimer();
			hideBar(2000);
			$playerUI.addClass('is-visible');
		});
	}else{
		$('#playerUI').prepend('<div id="center">');
		$('#ctl-button .ctl-button').prependTo('#center');
		$('#volume-container').addClass('hidden');
		$('.player-container>*').not('.remote-control').click(() => {
			$('#playerUI').addClass('is-visible');
			stopTimer();
			hideBar(2000);
		});
	}

	$('#live:not(.live)').click(() => vid.currentTime = vid.duration);

	$subtitles.click(() => {
		$subtitles.toggleClass('checked', !$subtitles.hasClass('checked'));
		localStorage.setItem('subtitles', $subtitles.hasClass('checked'));
		if (!cap) return;
		$subtitles.hasClass('checked') ? cap.show() : cap.hide();
	});
	if (localStorage.getItem('subtitles') == 'true') $subtitles.addClass('checked');

	if (DataStream) $remote.addClass('mdl-button--accent');
	$remote.on({
		'click': () => {
			if (!$remote.data('click')) return;

			clearTimeout($remote.data('click'));
			$remote.data('click', false);
			const disabled = !$remote_control.hasClass('disabled');
			$remote_control.toggleClass('disabled', disabled).find('button').prop('disabled', disabled);

			if ($('.is_cast').data('canPlay')){
				cbDatacast();
				return;
			}

			if (disabled){
				if (!DataStream) toggleDataStream(false);
			}else{
				if (!onDataStream) toggleDataStream(true);
				if (!theater) $('#apps').prop('checked', true);
			}
		},
		'touchstart mousedown': e => {
			if (e.which > 1 || $remote.data('click')) return;

			$remote.data('click', setTimeout(() => {
				$remote.data('click', false);
				DataStream = !DataStream;
				localStorage.setItem('DataStream', DataStream);
				$remote.toggleClass('mdl-button--accent', DataStream);

				if ($('.is_cast').data('canPlay')){
					cbDatacast();
					return;
				}
	
				if (DataStream){
					if (!onDataStream) toggleDataStream(true);
				}else{
					if ($remote_control.hasClass('disabled')) toggleDataStream(false);
				}
			}, 1000));
		}
	});

	$('#num').change(e => $('.remote-control .num').toggleClass('hidden', !$(e.currentTarget).prop('checked')));

	if (localStorage.getItem('danmaku') == 'true') $danmaku.addClass('checked');
	if (Jikkyo) $danmaku.addClass('mdl-button--accent');

	$danmaku.on({
		'click': () => {
			if (!$danmaku.data('click')) return;

			clearTimeout($danmaku.data('click'));
			$danmaku.data('click', false).toggleClass('checked', !$danmaku.hasClass('checked'));
			localStorage.setItem('danmaku', $danmaku.hasClass('checked'));

			if ($danmaku.data('log')){
				if (!$('.is_cast').data('path')) return;
				Jikkyolog();
				return;
			}

			if($danmaku.hasClass('checked')){
				if (!onJikkyoStream) toggleJikkyo(true);
				if (danmaku) danmaku.show();
			}else{
				if (!Jikkyo) toggleJikkyo(false);
				if (danmaku) danmaku.hide();
			}
		},
		'touchstart mousedown': e => {
			if (e.which > 1 || $danmaku.data('click')) return;

			$danmaku.data('click', setTimeout(() => {
				$danmaku.data('click', false);
				Jikkyo = !Jikkyo;
				localStorage.setItem('Jikkyo', Jikkyo);
				if (Jikkyo){
					if (!onJikkyoStream) toggleJikkyo();
					$danmaku.addClass('mdl-button--accent');
				}else{
					if (!$danmaku.hasClass('checked')) toggleJikkyo(false);
					$danmaku.removeClass('mdl-button--accent');
				}
			}, 1000));
		}
	});
	
	$('#apps').change(e => {
		($(e.currentTarget).prop('checked'))
			? $('#comment-control').insertAfter('#apps-contener>.contener>.contener')
			: $('#comment-control').prependTo('.player-container');
		localStorage.setItem('apps', $(e.currentTarget).prop('checked'));
	});
	if (localStorage.getItem('apps') == 'true') $('#apps').click();

	$('#comment-control').hover(e => $(e.currentTarget).addClass('is-visible'), e => $(e.currentTarget).removeClass('is-visible'));

	$('#comm').focus(() => $('#comment-control').addClass('is-focused')
		).blur(() => $('#comment-control').removeClass('is-focused')
		).change(e => $('#comment-control').toggleClass('is-dirty', $(e.currentTarget).val()!='')
	);

	//準備できてから再生開始
	if (readyToAutoPlay) readyToAutoPlay();
});
