console.log("=== SCRIPT DE RÁDIO TV INICIADO ===");

let servidoresDisponiveis = [
    'de1.api.radio-browser.info',
    'nl1.api.radio-browser.info',
    'fr1.api.radio-browser.info'
];
let servidorAtualIndex = 0;

function getBaseUrl() {
    return `https://${servidoresDisponiveis[servidorAtualIndex]}/json`;
}

async function inicializarServidores() {
    try {
        const resposta = await fetch('https://all.api.radio-browser.info/json/servers');
        const dados = await resposta.json();
        if (dados && dados.length > 0) {
            servidoresDisponiveis = dados.map(s => s.name);
            servidoresDisponiveis.sort(() => Math.random() - 0.5);
        }
    } catch (e) { console.log("Erro ao carregar servidores:", e); }
}

async function fetchComFailover(endpointPath) {
    let tentativas = 0;
    while (tentativas < servidoresDisponiveis.length) {
        try {
            const resposta = await fetch(`${getBaseUrl()}${endpointPath}`);
            if (!resposta.ok) throw new Error(`HTTP: ${resposta.status}`);
            return resposta;
        } catch (e) {
            servidorAtualIndex = (servidorAtualIndex + 1) % servidoresDisponiveis.length;
            tentativas++;
        }
    }
    throw new Error("Falha em todos os servidores.");
}

const audioPlayer = document.getElementById('audioPlayer');
const playingTitle = document.getElementById('currentStationName');
const songMetadata = document.getElementById('currentStationMeta');
const playerStatus = document.getElementById('playerStatusText');
// CORREÇÃO: Alinhado o ID com o ficheiro index.html ("playerToggleBtn")
const playerToggleBtn = document.getElementById('playerToggleBtn');

const countrySelect = document.getElementById('countrySelect');
const genreSelect = document.getElementById('genreSelect');
const languageSelect = document.getElementById('languageSelect');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const btnLimparFiltros = document.getElementById('clearFiltersBtn');

const searchRadioList = document.getElementById('searchResultsList');
const searchCount = document.getElementById('stationCount');

const secondaryRadioList = document.getElementById('secondaryList') || 
                           document.getElementById('secondaryRadioList');

const tabRecentesBtn = document.querySelector('[data-tab="recents"]');
const tabFavoritasBtn = document.querySelector('[data-tab="favorites"]');
const tabTrendingBtn = document.querySelector('[data-tab="top"]');

let abaSecundariaAtiva = 'recentes'; 

let recentesRadios = JSON.parse(localStorage.getItem('tua_radio_recentes')) || [];
let favoritasRadios = JSON.parse(localStorage.getItem('tua_radio_favoritas')) || [];
let trendingRadios = [];
let ultimosDadosPesquisa = [];
let radioAtualUrl = null; 

// Carregamento de Filtros
async function carregarPaises() {
    try {
        const res = await fetchComFailover('/countries');
        const paises = await res.json();
        paises.sort((a, b) => a.name.localeCompare(b.name));
        countrySelect.innerHTML = '<option value="">Todos os países</option>';
        paises.forEach(p => {
            if (p.stationcount > 0) {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = `${p.name} (${p.stationcount})`;
                countrySelect.appendChild(opt);
            }
        });
    } catch (e) { console.log(e); }
}

async function carregarGeneros() {
    try {
        const res = await fetchComFailover('/tags?limit=40&order=stationcount&reverse=true');
        const tags = await res.json();
        genreSelect.innerHTML = '<option value="">Todos os géneros</option>';
        tags.forEach(t => {
            if (t.stationcount > 0) {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = `${t.name.charAt(0).toUpperCase() + t.name.slice(1)}`;
                genreSelect.appendChild(opt);
            }
        });
    } catch (e) { console.log(e); }
}

async function carregarIdiomas() {
    try {
        const res = await fetchComFailover('/languages?limit=40&order=stationcount&reverse=true');
        const langs = await res.json();
        languageSelect.innerHTML = '<option value="">Todos os idiomas</option>';
        langs.forEach(l => {
            if (l.stationcount > 0) {
                const opt = document.createElement('option');
                opt.value = l.name;
                opt.textContent = `${l.name.charAt(0).toUpperCase() + l.name.slice(1)}`;
                languageSelect.appendChild(opt);
            }
        });
    } catch (e) { console.log(e); }
}

function verificarFiltrosAtivos() {
    const termo = searchInput ? searchInput.value.trim() : '';
    const pais = countrySelect ? countrySelect.value : '';
    const genero = genreSelect ? genreSelect.value : '';
    const idioma = languageSelect ? languageSelect.value : '';

    if (searchInput) {
        if (termo !== '') searchInput.classList.add('filtro-ativo');
        else searchInput.classList.remove('filtro-ativo');
    }

    if (countrySelect) {
        if (pais !== '') countrySelect.classList.add('filtro-ativo');
        else countrySelect.classList.remove('filtro-ativo');
    }

    if (genreSelect) {
        if (genero !== '') genreSelect.classList.add('filtro-ativo');
        else genreSelect.classList.remove('filtro-ativo');
    }

    if (languageSelect) {
        if (idioma !== '') languageSelect.classList.add('filtro-ativo');
        else languageSelect.classList.remove('filtro-ativo');
    }
}

if (searchInput) searchInput.addEventListener('input', verificarFiltrosAtivos);
if (countrySelect) countrySelect.addEventListener('change', verificarFiltrosAtivos);
if (genreSelect) genreSelect.addEventListener('change', verificarFiltrosAtivos);
if (languageSelect) languageSelect.addEventListener('change', verificarFiltrosAtivos);

let estadoDetectado = null;
let paisDetectadoLocal = null;

async function detetarLocalizacao() {
    try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data && data.success && data.country) {
            estadoDetectado = data.region || null;
            paisDetectadoLocal = data.country;
            for (let opt of countrySelect.options) {
                if (opt.value.toLowerCase() === data.country.toLowerCase()) {
                    countrySelect.value = opt.value;
                    break;
                }
            }
            verificarFiltrosAtivos();
        }
    } catch (e) { console.log("Erro de geolocalização:", e); }
}

// ==========================================
// Controlo de Paginação e Pesquisa
// ==========================================
let currentOffset = 0;
const itensPorPagina = 30;

async function pesquisarRadios(acumular = false) {
    if (!acumular) {
        currentOffset = 0;
        if (searchRadioList) {
            searchRadioList.innerHTML = `<p class="loading-msg">A pesquisar estações...</p>`;
        }
    }

    const termo = searchInput ? searchInput.value.trim() : '';
    const pais = countrySelect ? countrySelect.value : '';
    const genero = genreSelect ? genreSelect.value : '';
    const idioma = languageSelect ? languageSelect.value : '';

    let endpoint = `/stations/search?limit=${itensPorPagina}&offset=${currentOffset}&hidebroken=true&order=clickcount&reverse=true`;
    
    if (pais) {
        endpoint += `&country=${encodeURIComponent(pais)}`;
    }

    const paisEhLocal = paisDetectadoLocal && pais.toLowerCase() === paisDetectadoLocal.toLowerCase();
    if (!termo && pais && estadoDetectado && paisEhLocal && !acumular) {
        endpoint += `&state=${encodeURIComponent(estadoDetectado)}`;
    }

    if (termo) endpoint += `&name=${encodeURIComponent(termo)}`;
    if (genero) endpoint += `&tag=${encodeURIComponent(genero)}`;
    if (idioma) endpoint += `&language=${encodeURIComponent(idioma)}`;

    try {
        const res = await fetchComFailover(endpoint);
        let dados = await res.json();
        const radiosValidas = dados.filter(r => r.lastcheckok === 1 && r.url);

        if (acumular) {
            ultimosDadosPesquisa = [...ultimosDadosPesquisa, ...radiosValidas];
        } else {
            ultimosDadosPesquisa = radiosValidas;
        }

        renderizarListaPesquisaComPaginacao(ultimosDadosPesquisa, radiosValidas.length, acumular);

    } catch (e) {
        console.error("Detalhe do erro na pesquisa:", e);
        if (searchRadioList) {
            searchRadioList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #ff9800;">
                    <p style="font-weight: bold; margin-bottom: 8px;">Não foi possível ligar à API de rádios.</p>
                    <p style="font-size: 14px; color: #ccc;">Verifica a tua ligação à internet ou se o servidor local tem acesso externo.</p>
                </div>
            `;
        }
    }
}

function renderizarListaPesquisa(radios) {
    if (!searchRadioList) return;
    
    if (!currentOffset) {
        searchRadioList.innerHTML = '';
    }

    if (searchCount) {
        searchCount.textContent = `${radios.length} estações`;
    }

    if (!radios || !radios.length) {
        if (!currentOffset) {
            searchRadioList.innerHTML = `<p class="loading-msg">Nenhuma estação encontrada.</p>`;
        }
        return;
    }

    radios.forEach((radio, index) => {
        if (index < currentOffset) return;

        const streamUrl = radio.url_resolved || radio.url;
        const isFav = favoritasRadios.some(f => (f.url_resolved || f.url || '').trim() === (streamUrl || '').trim());
        const estaTocando = (radioAtualUrl === streamUrl && !audioPlayer.paused);

        const cardElement = criarCartaoHTML(radio, isFav, estaTocando);
        searchRadioList.appendChild(cardElement);
    });
}

function renderizarListaPesquisaComPaginacao(radios, quantidadeRecebida, acumular = false) {
    renderizarListaPesquisa(radios);

    if (searchRadioList) {
        const botaoAntigo = document.getElementById('btn-carregar-mais');
        if (botaoAntigo) botaoAntigo.remove();

        if (quantidadeRecebida >= itensPorPagina) {
            const containerBotao = document.createElement('div');
            containerBotao.id = 'btn-carregar-mais';
            containerBotao.style.cssText = 'text-align: center; width: 100%; padding: 20px 20px 40px 20px;';
            
            const btnCarregar = document.createElement('button');
            btnCarregar.id = 'loadMoreBtn';
            btnCarregar.tabIndex = 0;
            btnCarregar.innerText = 'Carregar Mais Rádios';
            btnCarregar.style.cssText = 'padding: 12px 24px; font-size: 16px; cursor: pointer; border-radius: 8px; background-color: #2b2b2b; color: #ff9800; border: 2px solid #ff9800; font-weight: bold; outline: none; transition: border-color 0.2s;';
            
            btnCarregar.addEventListener('focus', () => {
                btnCarregar.style.borderColor = '#28a745';
            });
            btnCarregar.addEventListener('blur', () => {
                btnCarregar.style.borderColor = '#ff9800';
            });

            btnCarregar.onclick = () => {
                currentOffset += itensPorPagina;
                btnCarregar.innerText = 'A carregar...';
                pesquisarRadios(true);
            };

            btnCarregar.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    btnCarregar.click();
                }
            });

            containerBotao.appendChild(btnCarregar);
            searchRadioList.appendChild(containerBotao);
        }

        if (acumular) {
            const todosOsCartoes = searchRadioList.querySelectorAll('.radio-row-card');
            const primeiroNovoCartao = todosOsCartoes[currentOffset];
            if (primeiroNovoCartao) {
                primeiroNovoCartao.focus();
                primeiroNovoCartao.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        } else {
            const primeiroCartao = searchRadioList.querySelector('.radio-row-card');
            if (primeiroCartao && !currentOffset) {
                primeiroCartao.focus();
                primeiroCartao.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }
}

function criarCartaoHTML(radio, isFav, estaTocando) {
    const streamUrl = radio.url_resolved || radio.url;
    const nome = radio.name || 'Sem Nome';
    const pais = radio.country || 'Mundo';

    let countryCode = '';
    if (radio && typeof radio.countrycode === 'string') {
        countryCode = radio.countrycode.toLowerCase();
    }
    const urlBandeira = countryCode ? `https://flagcdn.com/w20/${countryCode}.png` : '';

    const row = document.createElement('div');
    row.className = `radio-row-card ${estaTocando ? 'playing' : ''}`;
    row.tabIndex = 0;
    row.setAttribute('data-url', streamUrl);
    row.setAttribute('data-name', nome);
    row.setAttribute('data-country', pais);
    row.setAttribute('data-countrycode', countryCode);

    row.innerHTML = `
        <div class="radio-row-info">
            <h4>${nome}</h4>
            <p>
                ${urlBandeira ? `<img src="${urlBandeira}" alt="${pais}" style="width: 20px; height: auto; margin-right: 6px; vertical-align: middle; border-radius: 2px;" onerror="this.style.display='none'">` : ''}
                ${pais}
            </p>
        </div>
        <div class="radio-row-actions">
            <div class="circle-indicator">
                <span class="indicator-icon">${estaTocando ? '♫' : '▶'}</span>
            </div>
            <button class="action-btn fav-btn" title="Favoritar">${isFav ? '⭐' : '☆'}</button>
        </div>
    `;

    const favBtn = row.querySelector('.fav-btn');
    favBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        executarToggleFavoritoComFoco(row, nome, pais, countryCode, streamUrl);
    });

    favBtn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            ev.stopPropagation();
            executarToggleFavoritoComFoco(row, nome, pais, countryCode, streamUrl);
        }
    });

    row.addEventListener('click', () => {
        tocarRadio(streamUrl, nome, pais, countryCode, row);
    });

    return row;
}

function atualizarListaSecundariaComFoco(indiceAtualAntesDeRemover) {
    atualizarListaSecundaria();

    setTimeout(() => {
        if (!secondaryRadioList) return;
        const novosCards = Array.from(secondaryRadioList.querySelectorAll('.radio-row-card'));
        
        if (novosCards.length > 0) {
            let indiceAlvo = indiceAtualAntesDeRemover;
            if (indiceAlvo >= novosCards.length) {
                indiceAlvo = novosCards.length - 1;
            }
            novosCards[indiceAlvo].focus();
            novosCards[indiceAlvo].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            if (tabFavoritasBtn) {
                tabFavoritasBtn.focus();
                tabFavoritasBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, 50);
}

function executarToggleFavoritoComFoco(cardRow, nome, pais, countryCode, url) {
    let indiceParaFoco = 0;
    
    if (abaSecundariaAtiva === 'favoritas' && secondaryRadioList) {
        const cardsAtuais = Array.from(secondaryRadioList.querySelectorAll('.radio-row-card'));
        indiceParaFoco = cardsAtuais.indexOf(cardRow);
    }

    toggleFavorito(nome, pais, countryCode, url);

    if (abaSecundariaAtiva === 'favoritas') {
        atualizarListaSecundariaComFoco(indiceParaFoco !== -1 ? indiceParaFoco : 0);
    }
}

async function atualizarListaSecundaria() {
    if (!secondaryRadioList) return;

    if (abaSecundariaAtiva === 'recentes') {
        const salvos = JSON.parse(localStorage.getItem('tua_radio_recentes')) || recentesRadios;
        recentesRadios = salvos;
        renderizarListaSecundaria(recentesRadios);
    } else if (abaSecundariaAtiva === 'favoritas') {
        const salvos = JSON.parse(localStorage.getItem('tua_radio_favoritas')) || favoritasRadios;
        favoritasRadios = salvos;
        renderizarListaSecundaria(favoritasRadios);
    } else if (abaSecundariaAtiva === 'trending') {
        if (trendingRadios.length === 0) {
            secondaryRadioList.innerHTML = `<p class="loading-msg">A carregar top cliques...</p>`;
            try {
                const res = await fetchComFailover('/stations/topclick/30?hidebroken=true');
                let dados = await res.json();
                trendingRadios = dados.filter(r => r.lastcheckok === 1 && r.url);
            } catch (e) { 
                trendingRadios = []; 
            }
        }
        renderizarListaSecundaria(trendingRadios);
    }
}

function renderizarListaSecundaria(radios) {
    if (!secondaryRadioList) return;
    secondaryRadioList.innerHTML = '';

    if (!radios || !radios.length) {
        secondaryRadioList.innerHTML = `<p class="loading-msg">Sem itens nesta lista.</p>`;
        return;
    }

    radios.forEach((radio) => {
        const streamUrl = radio.url_resolved || radio.url;
        const isFav = favoritasRadios.some(f => (f.url_resolved || f.url || '').trim() === (streamUrl || '').trim());
        const estaTocando = (radioAtualUrl === streamUrl && !audioPlayer.paused);

        const cardElement = criarCartaoHTML(radio, isFav, estaTocando);
        secondaryRadioList.appendChild(cardElement);
    });
}

function mudarAbaSecundaria(abaDestino) {
    abaSecundariaAtiva = abaDestino;
    
    [tabRecentesBtn, tabFavoritasBtn, tabTrendingBtn].forEach(b => {
        if (b) b.classList.remove('active');
    });

    if (abaDestino === 'recentes' && tabRecentesBtn) tabRecentesBtn.classList.add('active');
    if (abaDestino === 'favoritas' && tabFavoritasBtn) tabFavoritasBtn.classList.add('active');
    if (abaDestino === 'trending' && tabTrendingBtn) tabTrendingBtn.classList.add('active');
    
    atualizarListaSecundaria();
}

if (tabRecentesBtn) {
    tabRecentesBtn.addEventListener('focus', () => mudarAbaSecundaria('recentes'));
    tabRecentesBtn.addEventListener('click', () => mudarAbaSecundaria('recentes'));
}
if (tabFavoritasBtn) {
    tabFavoritasBtn.addEventListener('focus', () => mudarAbaSecundaria('favoritas'));
    tabFavoritasBtn.addEventListener('click', () => mudarAbaSecundaria('favoritas'));
}
if (tabTrendingBtn) {
    tabTrendingBtn.addEventListener('focus', () => mudarAbaSecundaria('trending'));
    tabTrendingBtn.addEventListener('click', () => mudarAbaSecundaria('trending'));
}

function atualizarEstadosVisuaisNasListas() {
    const todosOsCards = document.querySelectorAll('.radio-row-card');
    todosOsCards.forEach(card => {
        const urlCard = card.getAttribute('data-url');
        const estaTocando = (radioAtualUrl === urlCard && !audioPlayer.paused);
        const indicatorIcon = card.querySelector('.indicator-icon');
        const isFav = favoritasRadios.some(f => (f.url_resolved || f.url) === urlCard);
        const favBtn = card.querySelector('.fav-btn');

        if (estaTocando) {
            card.classList.add('playing');
            if (indicatorIcon) indicatorIcon.textContent = '♫';
        } else {
            card.classList.remove('playing');
            if (indicatorIcon) indicatorIcon.textContent = '▶';
        }

        if (favBtn) {
            favBtn.textContent = isFav ? '⭐' : '☆';
        }
    });
}

function acionarCard(streamUrl, nome, pais, countryCode, cardElement) {
    let targetElement = cardElement;
    if (!targetElement && event && event.currentTarget) {
        targetElement = event.currentTarget;
    }

    let realName = nome;
    let realPais = pais;
    let realCode = countryCode;
    let realUrl = streamUrl;

    if (targetElement && targetElement.getAttribute) {
        realUrl = realUrl || targetElement.getAttribute('data-url');
        realName = (typeof realName === 'string' && realName !== 'Sem Nome') ? realName : targetElement.getAttribute('data-name');
        realPais = (typeof realPais === 'string' && realPais !== 'Mundo') ? realPais : targetElement.getAttribute('data-country');
        realCode = realCode || targetElement.getAttribute('data-countrycode');
        
        if (!realName) {
            const h4 = targetElement.querySelector('h4');
            if (h4) realName = h4.textContent;
        }
        if (!realPais || realPais === 'Mundo') {
            const p = targetElement.querySelector('.radio-row-info p');
            if (p) {
                const clone = p.cloneNode(true);
                const img = clone.querySelector('img');
                if (img) img.remove();
                realPais = clone.textContent.trim() || 'Mundo';
            }
        }
    }

    realName = realName || 'Sem Nome';
    realPais = realPais || 'Mundo';

    if (radioAtualUrl === realUrl && audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
        if (playerToggleBtn) playerToggleBtn.textContent = "▶";
        if (playerStatus) playerStatus.textContent = "Pausado";
        atualizarEstadosVisuaisNasListas();
        if (targetElement && document.body.contains(targetElement)) {
            targetElement.focus();
        }
    } else {
        tocarRadio(realUrl, realName, realPais, realCode, targetElement);
    }
}

window.tocarRadio = function(url, nome, pais, countryCode, cardElement) {
    let streamUrl = url;
    let radioNome = nome;
    let radioPais = pais;
    let radioCode = countryCode;

    if (cardElement && typeof cardElement === 'object' && cardElement.getAttribute) {
        streamUrl = streamUrl || cardElement.getAttribute('data-url');
        radioNome = radioNome || cardElement.getAttribute('data-name');
        radioPais = radioPais || cardElement.getAttribute('data-country');
        radioCode = radioCode || cardElement.getAttribute('data-countrycode');
    }

    if ((!radioNome || radioNome === 'Sem Nome') && streamUrl) {
        const cartaoDom = document.querySelector(`.radio-row-card[data-url="${CSS.escape(streamUrl)}"]`);
        if (cartaoDom) {
            const h4 = cartaoDom.querySelector('h4');
            if (h4) radioNome = h4.textContent;
            const p = cartaoDom.querySelector('.radio-row-info p');
            if (p) {
                const clone = p.cloneNode(true);
                const img = clone.querySelector('img');
                if (img) img.remove();
                radioPais = clone.textContent.trim() || radioPais;
            }
            if (!radioCode) {
                radioCode = cartaoDom.getAttribute('data-countrycode');
            }
        }
    }

    radioNome = radioNome || 'Sem Nome';
    radioPais = radioPais || 'Mundo';
    streamUrl = streamUrl || radioAtualUrl;

    if (!streamUrl) return;

    radioAtualUrl = streamUrl;
    audioPlayer.src = streamUrl;
    
    audioPlayer.play().then(() => {
        if (playerStatus) playerStatus.textContent = "No Air";
        if (playingTitle) playingTitle.textContent = radioNome;
        if (songMetadata) songMetadata.textContent = `🎵 ${radioPais}`;
        if (playerToggleBtn) playerToggleBtn.textContent = "⏸";
    }).catch((err) => { 
        if (playerStatus) playerStatus.textContent = "Erro"; 
    });

    const cleanCountryCode = (typeof radioCode === 'string') ? radioCode.trim().toLowerCase() : '';

    const radioObj = { 
        name: radioNome, 
        country: radioPais, 
        countrycode: cleanCountryCode, 
        url_resolved: streamUrl 
    };

    recentesRadios = recentesRadios.filter(r => {
        const rUrl = (r.url_resolved || r.url || '').trim();
        return rUrl !== streamUrl.trim();
    });
    
    recentesRadios.unshift(radioObj);
    if (recentesRadios.length > 20) recentesRadios.pop();
    
    localStorage.setItem('tua_radio_recentes', JSON.stringify(recentesRadios));

    atualizarEstadosVisuaisNasListas();
    
    if (abaSecundariaAtiva === 'recentes') {
        atualizarListaSecundaria();
        
        const veioDaPesquisa = cardElement && searchRadioList && searchRadioList.contains(cardElement);

        if (!veioDaPesquisa) {
            setTimeout(() => {
                if (secondaryRadioList) {
                    const primeiroCardRecente = secondaryRadioList.querySelector('.radio-row-card');
                    if (primeiroCardRecente) {
                        primeiroCardRecente.focus();
                        primeiroCardRecente.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            }, 60);
        }
    }
};

window.toggleFavorito = function(nome, pais, countryCode, url) {
    const urlAlvo = url ? url.trim() : '';
    const index = favoritasRadios.findIndex(f => (f.url_resolved || f.url || '').trim() === urlAlvo);
    
    if (index >= 0) {
        favoritasRadios.splice(index, 1);
    } else {
        favoritasRadios.push({ 
            name: nome, 
            country: pais, 
            countrycode: countryCode || '', 
            url_resolved: urlAlvo 
        });
    }
    
    localStorage.setItem('tua_radio_favoritas', JSON.stringify(favoritasRadios));
    atualizarEstadosVisuaisNasListas();
};

function focarItemInicial() {
    if (recentesRadios && recentesRadios.length > 0) {
        mudarAbaSecundaria('recentes');
        const primeiroCardRecente = document.querySelector('#secondaryList .radio-row-card, #secondaryRadioList .radio-row-card');
        if (primeiroCardRecente) {
            primeiroCardRecente.focus();
            primeiroCardRecente.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }
    }
    
    const primeiroCardPesquisa = document.querySelector('#searchResultsList .radio-row-card');
    if (primeiroCardPesquisa) {
        primeiroCardPesquisa.focus();
        primeiroCardPesquisa.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

document.addEventListener('keydown', (e) => {
    const focused = document.activeElement;

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn && focused === loadMoreBtn) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const allCards = Array.from(searchRadioList.querySelectorAll('.radio-row-card'));
            if (allCards.length > 0) {
                const ultimoCartao = allCards[allCards.length - 1];
                ultimoCartao.focus();
                ultimoCartao.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
        }
    }

    if (e.key === 'Backspace' || e.keyCode === 8) {
        if (document.activeElement === searchInput) {
            return; 
        }

        e.preventDefault();
        
        if (audioPlayer && !audioPlayer.paused) {
            audioPlayer.pause();
            if (playerToggleBtn) playerToggleBtn.textContent = "▶";
            if (playerStatus) playerStatus.textContent = "Pausado";
            atualizarEstadosVisuaisNasListas();
        }

        const playerBtn = document.querySelector('.player-main-btn');
        if (playerBtn) {
            playerBtn.focus();
            playerBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
    }

    if (!focused) return;

    if (focused.closest('.sidebar-tv')) {
        const sidebarElements = Array.from(document.querySelectorAll('.sidebar-tv select, .sidebar-tv input, .sidebar-tv button'));
        const currentIndex = sidebarElements.indexOf(focused);

        if (e.key === 'ArrowDown' && currentIndex < sidebarElements.length - 1) {
            e.preventDefault();
            sidebarElements[currentIndex + 1].focus();
        } else if (e.key === 'ArrowUp' && currentIndex > 0) {
            e.preventDefault();
            sidebarElements[currentIndex - 1].focus();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const primeiroCard = document.querySelector('#searchResultsList .radio-row-card');
            if (primeiroCard) primeiroCard.focus();
        }
    }
    else if (focused.classList && focused.classList.contains('tab-btn')) {
        const tabs = [tabRecentesBtn, tabFavoritasBtn, tabTrendingBtn].filter(Boolean);
        const currentIndex = tabs.indexOf(focused);

        if (e.key === 'ArrowRight' && currentIndex < tabs.length - 1) {
            e.preventDefault();
            tabs[currentIndex + 1].focus();
            if (tabs[currentIndex + 1] === tabRecentesBtn) mudarAbaSecundaria('recentes');
            if (tabs[currentIndex + 1] === tabFavoritasBtn) mudarAbaSecundaria('favoritas');
            if (tabs[currentIndex + 1] === tabTrendingBtn) mudarAbaSecundaria('trending');
        } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
            e.preventDefault();
            tabs[currentIndex - 1].focus();
            if (tabs[currentIndex - 1] === tabRecentesBtn) mudarAbaSecundaria('recentes');
            if (tabs[currentIndex - 1] === tabFavoritasBtn) mudarAbaSecundaria('favoritas');
            if (tabs[currentIndex - 1] === tabTrendingBtn) mudarAbaSecundaria('trending');
        } else if (e.key === 'ArrowLeft' && currentIndex === 0) {
            e.preventDefault();
            const primeiroCardPesquisa = document.querySelector('#searchResultsList .radio-row-card');
            if (primeiroCardPesquisa) primeiroCardPesquisa.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const primeiroCardSec = document.querySelector('#secondaryList .radio-row-card, #secondaryRadioList .radio-row-card');
            if (primeiroCardSec) primeiroCardSec.focus();
        }
    }
    else if (focused.closest && focused.closest('.radio-row-card')) {
        const currentCard = focused.closest('.radio-row-card');
        const parentList = currentCard.parentElement;
        const allCards = Array.from(parentList.querySelectorAll('.radio-row-card'));
        const currentIndex = allCards.indexOf(currentCard);
        const favBtn = currentCard.querySelector('.fav-btn');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentIndex < allCards.length - 1) {
                allCards[currentIndex + 1].focus();
                allCards[currentIndex + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (currentIndex === allCards.length - 1 && parentList.id === 'searchResultsList') {
                const loadMoreBtn = document.getElementById('loadMoreBtn');
                if (loadMoreBtn) {
                    loadMoreBtn.focus();
                    loadMoreBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentIndex > 0) {
                allCards[currentIndex - 1].focus();
                allCards[currentIndex - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                if (abaSecundariaAtiva === 'recentes' && tabRecentesBtn) {
                    tabRecentesBtn.focus();
                } else if (abaSecundariaAtiva === 'favoritas' && tabFavoritasBtn) {
                    tabFavoritasBtn.focus();
                } else if (abaSecundariaAtiva === 'trending' && tabTrendingBtn) {
                    tabTrendingBtn.focus();
                }
            }
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (focused === currentCard) {
                favBtn.focus();
            } else if (focused === favBtn && parentList.id === 'searchResultsList') {
                if (tabRecentesBtn) tabRecentesBtn.focus();
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (focused === favBtn) {
                currentCard.focus();
            } else if (focused === currentCard && parentList.id === 'searchResultsList') {
                if (searchInput) searchInput.focus();
            } else if (focused === currentCard && parentList !== searchRadioList) {
                if (abaSecundariaAtiva === 'recentes' && tabRecentesBtn) tabRecentesBtn.focus();
                else if (abaSecundariaAtiva === 'favoritas' && tabFavoritasBtn) tabFavoritasBtn.focus();
                else if (abaSecundariaAtiva === 'trending' && tabTrendingBtn) tabTrendingBtn.focus();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const url = currentCard.getAttribute('data-url');
            const nome = currentCard.getAttribute('data-name');
            const pais = currentCard.getAttribute('data-country');
            const countryCode = currentCard.getAttribute('data-countrycode') || '';
            
            if (focused === favBtn) {
                executarToggleFavoritoComFoco(currentCard, nome, pais, countryCode, url);
            } else {
                acionarCard(url, nome, pais, countryCode, currentCard);
            }
        }
    }
});

// ==========================================
// Controlo do Botão Principal do Player
// ==========================================
if (playerToggleBtn) {
    const alternarReproducaoPlayer = () => {
        if (!audioPlayer.src && recentesRadios && recentesRadios.length > 0) {
            const primeiraRadio = recentesRadios[0];
            const streamUrl = primeiraRadio.url_resolved || primeiraRadio.url;
            tocarRadio(streamUrl, primeiraRadio.name, primeiraRadio.country, primeiraRadio.countrycode);
            return;
        }

        if (!audioPlayer.src) {
            return; 
        }

        if (audioPlayer.paused) {
            audioPlayer.play().then(() => {
                playerToggleBtn.textContent = "⏸"; 
                if (playerStatus) playerStatus.textContent = "No Air";
                atualizarEstadosVisuaisNasListas();
            }).catch(err => {
                console.log("Erro ao reproduzir áudio:", err);
                if (playerStatus) playerStatus.textContent = "Erro";
            });
        } else {
            audioPlayer.pause();
            playerToggleBtn.textContent = "▶"; 
            if (playerStatus) playerStatus.textContent = "Pausado";
            atualizarEstadosVisuaisNasListas();
        }
    };

    playerToggleBtn.addEventListener('click', alternarReproducaoPlayer);

    playerToggleBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            alternarReproducaoPlayer();
        }
    });
}

if (searchBtn) {
    searchBtn.addEventListener('click', () => pesquisarRadios(false));
}

if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            pesquisarRadios(false);
        }
    });
}

if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (countrySelect) countrySelect.value = '';
        if (genreSelect) genreSelect.value = '';
        if (languageSelect) languageSelect.value = '';
        verificarFiltrosAtivos();
    });
}

async function iniciarApp() {
    await inicializarServidores();
    await Promise.all([carregarPaises(), carregarGeneros(), carregarIdiomas()]);
    await detetarLocalizacao();
    await pesquisarRadios();
    await atualizarListaSecundaria();
    
    focarItemInicial();
}

iniciarApp();