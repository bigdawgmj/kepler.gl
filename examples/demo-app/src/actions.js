// Copyright (c) 2019 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {push} from 'react-router-redux';
import {request, text as requestText, json as requestJson} from 'd3-request';
import {loadFiles, toggleModal} from 'kepler.gl/actions';

import {
  LOADING_SAMPLE_ERROR_MESSAGE,
  LOADING_SAMPLE_LIST_ERROR_MESSAGE,
  MAP_CONFIG_URL, MAP_URI
} from './constants/default-settings';
import {LOADING_METHODS_NAMES} from './constants/default-settings';
import {CLOUD_PROVIDERS} from './utils/cloud-providers';
import {generateHashId} from './utils/strings';
import KeplerGlSchema from 'kepler.gl/schemas';

// CONSTANTS
export const INIT = 'INIT';
export const SET_LOADING_METHOD = 'SET_LOADING_METHOD';
export const LOAD_REMOTE_RESOURCE_SUCCESS = 'LOAD_REMOTE_RESOURCE_SUCCESS';
export const LOAD_REMOTE_RESOURCE_ERROR = 'LOAD_REMOTE_RESOURCE_ERROR';
export const LOAD_MAP_SAMPLE_FILE = 'LOAD_MAP_SAMPLE_FILE';
export const SET_SAMPLE_LOADING_STATUS = 'SET_SAMPLE_LOADING_STATUS';
export const REQUEST_COMBINED_RESULTS = 'REQUEST_COMBINED_RESULTS';
export const RECEIVE_COMBINED_RESULTS = 'RECEIVE_COMBINED_RESULTS';

// Sharing
export const PUSHING_FILE = 'PUSHING_FILE';
export const CLOUD_LOGIN_SUCCESS  = 'CLOUD_LOGIN_SUCCESS';

// ACTIONS
export function initApp() {
  return {
    type: INIT
  };
}

/**
 * this method loads the combined_results.json
 * @param {string} method the string id for the loading method to use
 * @returns {{type: string, method: *}}
 */
export function requestCombinedResults(url) {
  return {
    type: REQUEST_COMBINED_RESULTS,
    url
  };
}

export function receiveCombinedResults(url, json) {
  console.log(json);
  const sas = '?sv=2018-03-28&ss=bfqt&srt=sco&sp=rwdlacup&se=2019-10-07T23:09:59Z&st=2019-10-07T15:09:59Z&spr=https&sig=JLdLoRbzaVdQr%2BJwCbsTitTkDMbi3Rp7QnHl9HqADTY%3D';
  // const files = _mapGeojsonFiles(json);
  // this.loadRemoteMap(files.arrival + sas);
  // this.loadRemoteMap(files.depth + sas);
  return {
    type: RECEIVE_COMBINED_RESULTS,
    url,
    combinedResults: _mapGeojsonFiles(json),
    sas: sas,
    receivedAt: Date.now()
  };
}

function _mapFiles(files) {
  return files.filter(f => 
    f.Url.lastIndexOf('.geojson') !== -1 && 
    f.Url.lastIndexOf('crop') === -1);
}

// TODO: Clean this up!
function _mapGeojsonFiles(json) {
  const arrival = json['post-process-arrival']['resultFiles'];
  const arr = _mapFiles(arrival)[0]['Url'];
  const depth = json['post-process-depth']['resultFiles'];
  const dep = _mapFiles(depth)[0]['Url'];
  console.log(arr, dep);
  return {
    'arrival': arr,
    'depth': dep
  };
}

export function fetchCombinedResults(url) {
  console.log(url);
  return function(dispatch) {
    dispatch(requestCombinedResults(url))

    return fetch(url)
      .then(
        response => response.json(),
        error => console.log('An error occured getting combined_results.json', error)
      )
      .then(json => 
        dispatch(receiveCombinedResults(url, json))
      )
  }
}

/**
 * this method set the current loading method
 * @param {string} method the string id for the loading method to use
 * @returns {{type: string, method: *}}
 */
export function setLoadingMethod(method) {
  return {
    type: SET_LOADING_METHOD,
    method
  };
}

/**
 * this action is triggered when user switches between load modal tabs
 * @param {string} method
 * @returns {Function}
 */
export function switchToLoadingMethod(method) {
  return (dispatch, getState) => {
    dispatch(setLoadingMethod(method));
    if (method === LOADING_METHODS_NAMES.sample && getState().demo.app.sampleMaps.length === 0) {
      dispatch(loadSampleConfigurations());
    }
  };
}

export function loadRemoteResourceSuccess(response, config, options) {
  return {
    type: LOAD_REMOTE_RESOURCE_SUCCESS,
    response,
    config,
    options
  };
}

export function loadRemoteResourceError(error, url) {
  return {
    type: LOAD_REMOTE_RESOURCE_ERROR,
    error,
    url
  }
}

export function loadMapSampleFile(samples) {
  return {
    type: LOAD_MAP_SAMPLE_FILE,
    samples
  };
}

export function setLoadingMapStatus(isMapLoading) {
  return {
    type: SET_SAMPLE_LOADING_STATUS,
    isMapLoading
  };
}

/**
 * this method detects whther the response status is < 200 or > 300 in case the error
 * is not caught by the actualy request framework
 * @param response the response
 * @returns {{status: *, message: (*|{statusCode}|Object)}}
 */
function detectResponseError(response) {
  if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
    return {
      status: response.statusCode,
      message: response.body || response.message || response
    }
  }
}

// This can be moved into Kepler.gl to provide ability to load data from remote URLs
/**
 * The method is able to load both data and kepler.gl files.
 * It uses loadFile action to dispatcha and add new datasets/configs
 * to the kepler.gl instance
 * @param options
 * @param {string} options.dataUrl the URL to fetch data from. Current supoprted file type json,csv, kepler.json
 * @returns {Function}
 */
export function loadRemoteMap(options) {
  return dispatch => {
    dispatch(setLoadingMapStatus(true));
    loadRemoteRawData(options.dataUrl).then(
      // In this part we turn the response into a FileBlob
      // so we can use it to call loadFiles
      file => {
        dispatch(loadFiles([
          /* eslint-disable no-undef */
          new File([file], options.dataUrl)
          /* eslint-enable no-undef */
        ])).then(
          () => dispatch(setLoadingMapStatus(false))
        );

      },
      error => {
        const {target = {}} = error;
        const {status, responseText} = target;
        dispatch(loadRemoteResourceError({status, message: responseText}, options.dataUrl));
      }
    );
  }
}

/**
 * The method is able to load combined_results.json files.
 * It uses loadFile action to dispatcha and add new datasets/configs
 * @param options
 * @param {string} options.resultsUrl the URL to fetch data from. Current supoprted file type json,csv, kepler.json
 * @returns {Function}
 */
export function loadCombinedResults(options) {
  return dispatch => {
    console.log('Called for results');
    // dispatch(setLoadingMapStatus(true));
    loadRemoteRawData(options.dataUrl).then(
      // In this part we turn the response into a FileBlob
      // so we can use it to call loadFiles
      file => {
        dispatch(loadFiles([
          /* eslint-disable no-undef */
          new File([file], options.dataUrl)
          /* eslint-enable no-undef */
        ])).then(
          () => dispatch(setLoadingMapStatus(false))
        );

      },
      error => {
        const {target = {}} = error;
        const {status, responseText} = target;
        dispatch(loadRemoteResourceError({status, message: responseText}, options.dataUrl));
      }
    );
  }
}

/**
 * Load a file from a remote URL
 * @param url
 * @returns {Promise<any>}
 */
function loadRemoteRawData(url) {
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    request(url, (error, result) => {
      if (error) {
        reject(error);
      }
      const responseError = detectResponseError(result);
      if (responseError) {
        reject(responseError);
        return;
      }
      resolve(result.response)
    })
  });
}

// The following methods are only used to load SAMPLES
/**
 *
 * @param {Object} options
 * @param {string} [options.dataUrl] the URL to fetch data from, e.g. https://raw.githubusercontent.com/uber-web/kepler.gl-data/master/earthquakes/data.csv
 * @param {string} [options.configUrl] the URL string to fetch kepler config from, e.g. https://raw.githubusercontent.com/uber-web/kepler.gl-data/master/earthquakes/config.json
 * @param {string} [options.id] the id used as dataset unique identifier, e.g. earthquakes
 * @param {string} [options.label] the label used to describe the new dataset, e.g. California Earthquakes
 * @param {string} [options.queryType] the type of query to execute to load data/config, e.g. sample
 * @param {string} [options.imageUrl] the URL to fetch the dataset image to use in sample gallery
 * @param {string} [options.description] the description used in sample galley to define the current example
 * @param {string} [options.size] the number of entries displayed in the current sample
 * @param {string} [keplergl] url to fetch the full data/config generated by kepler
 * @returns {Function}
 */
export function loadSample(options, pushRoute = true) {
  return (dispatch, getState) => {
    const {routing} = getState();
    if (options.id && pushRoute) {
      dispatch(push(`/demo/${options.id}${routing.locationBeforeTransitions.search}`));
    }
    // if the sample has a kepler.gl config file url we load it
    if (options.keplergl) {
      dispatch(loadRemoteMap({dataUrl: options.keplergl}));
    } else {
      dispatch(loadRemoteSampleMap(options));
    }

    dispatch(setLoadingMapStatus(true));
  };
}

/**
 * Load remote map with config and data
 * @param options {configUrl, dataUrl}
 * @returns {Function}
 */
function loadRemoteSampleMap(options) {
  return (dispatch) => {
    // Load configuration first
    const {configUrl, dataUrl} = options;

    Promise
      .all([loadRemoteConfig(configUrl), loadRemoteData(dataUrl)])
      .then(
        ([config, data]) => {
          // TODO: these two actions can be merged
          dispatch(loadRemoteResourceSuccess(data, config, options));
          dispatch(toggleModal(null));
        },
        error => {
          if (error) {
            const {target = {}} = error;
            const {status, responseText} = target;
            dispatch(loadRemoteResourceError({status, message: `${responseText} - ${LOADING_SAMPLE_ERROR_MESSAGE} ${options.id} (${configUrl})`}, configUrl));
          }
        }
      );
  }
}

/**
 *
 * @param url
 * @returns {Promise<any>}
 */
function loadRemoteConfig(url) {
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    requestJson(url, (error, config) => {
      if (error) {
        reject(error);
      }
      const responseError = detectResponseError(config);
      if (responseError) {
        reject(responseError);
        return;
      }
      resolve(config);
    })
  })
}

/**
 *
 * @param url to fetch data from (csv, json, geojson)
 * @returns {Promise<any>}
 */
function loadRemoteData(url) {
  console.log(url);
  if (!url) {
    // TODO: we should return reject with an appropriate error
    return Promise.resolve(null)
  }

  let requestMethod = requestText;
  if (url.includes('.json') || url.includes('.geojson')) {
    requestMethod = requestJson;
  }

  // Load data
  return new Promise((resolve, reject) => {
    requestMethod(url, (error, result) => {
      if (error) {
        reject(error);
      }
      const responseError = detectResponseError(result);
      if (responseError) {
        reject(responseError);
        return;
      }
      resolve(result);
    })
  });
}

/**
 *
 * @param sampleMapId optional if we pass the sampleMapId, after fetching
 * map sample configurations we are going to load the actual map data if it exists
 * @returns {function(*)}
 */
export function loadSampleConfigurations(sampleMapId = null) {
  return dispatch => {
    requestJson(MAP_CONFIG_URL, (error, samples) => {
      if (error) {
        const {target = {}} = error;
        const {status, responseText} = target;
        dispatch(loadRemoteResourceError({status, message: `${responseText} - ${LOADING_SAMPLE_LIST_ERROR_MESSAGE}`}, MAP_CONFIG_URL));
      } else {
        const responseError = detectResponseError(samples);
        if (responseError) {
          dispatch(loadRemoteResourceError(responseError, MAP_CONFIG_URL));
          return;
        }

        dispatch(loadMapSampleFile(samples));
        // Load the specified map
        const map = sampleMapId && samples.find(s => s.id === sampleMapId);
        if (map) {
          dispatch(loadSample(map, false));
        }
      }
    });
  }
}

/**
 * this action will be triggered when the file is being uploaded
 * @param isLoading
 * @param metadata
 * @returns {{type: string, isLoading: *, metadata: *}}
 */
export function setPushingFile(isLoading, metadata) {
  return {
    type: PUSHING_FILE,
    isLoading,
    metadata
  };
}

/**
 * This method will export the current kepler config file to the choosen cloud platform
 * @param data
 * @param handlerName
 * @returns {Function}
 */
export function exportFileToCloud(handlerName = 'dropbox') {
  const authHandler = CLOUD_PROVIDERS[handlerName];
  return (dispatch, getState) => {
    // extract data from kepler
    const data = KeplerGlSchema.save(getState().demo.keplerGl.map);
    const newBlob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const file = new File([newBlob], `/keplergl_${generateHashId(6)}.json`);
    // We are gonna pass the correct auth token to init the cloud provider
    dispatch(setPushingFile(true, {filename: file.name, status: 'uploading', metadata: null}));
    authHandler.uploadFile({blob: file, isPublic: true, authHandler})
    // need to perform share as well
      .then(
        response => {
          dispatch(push(`/${MAP_URI}${response.url}`));
          dispatch(setPushingFile(false, {filename: file.name, status: 'success', metadata: response}));
        },
        error => {
          dispatch(setPushingFile(false, {filename: file.name, status: 'error', error}));
        }
      )
  };
}

export function setCloudLoginSuccess() {
  return dispatch => {
    dispatch({type: CLOUD_LOGIN_SUCCESS}).then(
      () => {
        dispatch(exportFileToCloud());
      },
      () => {
        dispatch(setPushingFile(false, {filename: null, status: 'error', error: 'not able to propagate login successfully'}));
      }
    );
  };
}
